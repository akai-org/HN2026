"""Word extraction (block B2): DOCX via its XML, binary DOC via the piece table (olefile).

DOC choice: the binary format is read directly with `olefile` (BSD) instead of converting with LibreOffice,
so there is no external process and no copyleft tool in the image. Only text is recovered (no formatting),
which is all the LLM needs.
"""

import io
import struct
import zipfile

import olefile
from lxml import etree

from hacknation_2026.contracts import AppError, Block, ExtractedDocument, FileFormat
from hacknation_2026.extract._text import BOX, line_block, normalize

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"
W14 = "http://schemas.microsoft.com/office/word/2010/wordml"


def _w(tag: str) -> str:
  return f"{{{W}}}{tag}"


# ---------------------------------------------------------------- DOCX

def extract_docx(data: bytes) -> ExtractedDocument:
  try:
    archive = zipfile.ZipFile(io.BytesIO(data))
    root = etree.fromstring(archive.read("word/document.xml"))
    bullets = _bullet_glyphs(archive)
    leader_styles = _leader_tab_styles(archive)
  except Exception as exc:
    raise AppError("UNREADABLE_FILE", "Nie udało się odczytać pliku DOCX", 422) from exc
  walker = _DocxWalker(bullets, rendered_breaks=root.find(f".//{_w('lastRenderedPageBreak')}") is not None,
                       leader_styles=leader_styles)
  walker.walk(root.find(_w("body")))
  return ExtractedDocument(format=FileFormat.DOCX, blocks=walker.blocks)


def _bullet_glyphs(archive: zipfile.ZipFile) -> dict[tuple[str, str], str]:
  """(numId, ilvl) -> bullet glyph of Word lists; list markers are not part of the paragraph text."""
  rels = etree.fromstring(archive.read("word/_rels/document.xml.rels"))
  target = next((r.get("Target") for r in rels if r.get("Type", "").endswith("/numbering")), None)
  if not target:
    return {}
  numbering = etree.fromstring(archive.read(target.lstrip("/") if target.startswith("/") else f"word/{target}"))
  abstract = {}
  for a in numbering.iter(_w("abstractNum")):
    for lvl in a.iter(_w("lvl")):
      fmt, text = lvl.find(_w("numFmt")), lvl.find(_w("lvlText"))
      if fmt is not None and fmt.get(_w("val")) == "bullet" and text is not None:
        abstract[(a.get(_w("abstractNumId")), lvl.get(_w("ilvl")))] = text.get(_w("val"), "")
  glyphs = {}
  for num in numbering.iter(_w("num")):
    ref = num.find(_w("abstractNumId"))
    for (abstract_id, ilvl), glyph in abstract.items():
      if ref is not None and ref.get(_w("val")) == abstract_id:
        glyphs[(num.get(_w("numId")), ilvl)] = glyph
  return glyphs


LEADERS = {"dot", "underscore", "hyphen", "middleDot", "heavy"}


def _has_leader_tab(element) -> bool:
  """A tab stop drawn with dots/underscores: on paper it is a fill-in line, in the XML only a tab character."""
  tabs = element.find(_w("tabs")) if element is not None else None
  return tabs is not None and any(t.get(_w("leader")) in LEADERS for t in tabs.iter(_w("tab")))


def _leader_tab_styles(archive: zipfile.ZipFile) -> set[str]:
  """Paragraph style ids whose tab stops (own or inherited through basedOn) have a fill-in leader."""
  if "word/styles.xml" not in archive.namelist():
    return set()
  styles = etree.fromstring(archive.read("word/styles.xml"))
  based_on, own = {}, set()
  for style in styles.iter(_w("style")):
    style_id = style.get(_w("styleId"))
    parent = style.find(_w("basedOn"))
    based_on[style_id] = parent.get(_w("val")) if parent is not None else None
    if _has_leader_tab(style.find(_w("pPr"))):
      own.add(style_id)
  result = set()
  for style_id in based_on:
    seen, current = set(), style_id
    while current and current not in seen:
      if current in own:
        result.add(style_id)
        break
      seen.add(current)
      current = based_on.get(current)
  return result


def _underlined(node) -> bool:
  run = node.getparent()
  props = run.find(_w("rPr")) if run is not None and run.tag == _w("r") else None
  underline = props.find(_w("u")) if props is not None else None
  return underline is not None and underline.get(_w("val"), "single") != "none"


class _DocxWalker:
  """Visits body content in document order; text boxes are read once (mc:Choice), never their mc:Fallback copy."""

  def __init__(self, bullets: dict[tuple[str, str], str], rendered_breaks: bool, leader_styles: set[str] = frozenset()):
    self.blocks: list[Block] = []
    self.leader_styles = leader_styles
    self.page = 1
    self.bullets = bullets
    # Word stores both explicit page breaks and where it last broke pages; count only one kind.
    self.page_mark = _w("lastRenderedPageBreak") if rendered_breaks else None

  def walk(self, element) -> None:
    for child in element:
      if child.tag == f"{{{MC}}}Fallback":
        continue
      if child.tag == _w("tbl"):
        rows = [[normalize(self._cell_text(cell)).replace(BOX, "[ ]") for cell in row.iter(_w("tc"))]
                for row in child.iter(_w("tr"))]
        # An empty cell next to filled-in labels is a place to write; rows with no text at all are layout filler.
        rows = [[cell or "____" for cell in row] for row in rows if any(row)]
        if rows:
          self.blocks.append(Block(kind="table", rows=rows, page=self.page))
      elif child.tag == _w("p"):
        text, checked = self._paragraph_text(child)
        block = line_block(text, self.page)
        if block:
          if block.kind == "checkbox":
            block.checked = checked
          self.blocks.append(block)
        self.walk(child)          # text boxes anchored in this paragraph
      else:
        self.walk(child)

  def _paragraph_text(self, paragraph) -> tuple[str, bool]:
    """Own text of the paragraph (not of nested text boxes) and whether its checkbox is ticked."""
    parts, checked = [], False
    props = paragraph.find(_w("pPr"))
    style = props.find(_w("pStyle")) if props is not None else None
    leader = _has_leader_tab(props) or (style is not None and style.get(_w("val")) in self.leader_styles)
    num = paragraph.find(f"{_w('pPr')}/{_w('numPr')}")
    if num is not None:
      ids = (num.find(_w("numId")), num.find(_w("ilvl")))
      glyph = self.bullets.get(tuple(x.get(_w("val")) if x is not None else "0" for x in ids))
      if glyph is not None:
        parts.append(BOX if normalize(glyph) == BOX else "- ")   # shortcut: numbered (non-bullet) lists get no marker
    for node in paragraph.iter():
      if node is not paragraph and node.tag == _w("p"):
        continue
      if _inside(node, paragraph, {f"{{{MC}}}Fallback", _w("txbxContent")}):
        continue
      tag = node.tag
      if tag == _w("t") and node.text:
        # underlined spaces print as a fill-in line
        parts.append(" ____ " if not node.text.strip() and _underlined(node) else node.text)
      elif tag == _w("tab") and node.getparent().tag == _w("r") and (leader or _underlined(node)):
        parts.append(" ____ ")   # shortcut: every tab in a paragraph with a leader stop is taken as that stop
      elif tag == _w("fldChar") and node.find(f"{_w('ffData')}/{_w('textInput')}") is not None:
        parts.append(" ____ ")   # legacy FORMTEXT field
      elif tag in (_w("tab"), _w("br")):
        if tag == _w("br") and node.get(_w("type")) == "page" and self.page_mark is None:
          self.page += 1
        parts.append(" ")
      elif tag == self.page_mark:
        self.page += 1
      elif tag == _w("sym"):
        parts.append(chr(int(node.get(_w("char"), "0"), 16)))
      elif tag == _w("checkBox") or tag == f"{{{W14}}}checkbox":  # legacy form field / content control
        parts.append(BOX)
        checked = checked or _is_checked(node)
    text = "".join(parts)
    if "☒" in text or "☑" in text:
      checked = True
      text = text.replace("☒", BOX).replace("☑", BOX)
    return text, checked

  def _cell_text(self, cell) -> str:
    texts = []
    for paragraph in cell.iter(_w("p")):
      if not _inside(paragraph, cell, {f"{{{MC}}}Fallback"}):
        texts.append(self._paragraph_text(paragraph)[0])
    return " ".join(t for t in texts if t.strip())


def _inside(node, stop, tags: set[str]) -> bool:
  parent = node.getparent()
  while parent is not None and parent is not stop:
    if parent.tag in tags:
      return True
    parent = parent.getparent()
  return False


def _is_checked(node) -> bool:
  for child in node.iter():
    if child.tag in (_w("checked"), _w("default"), f"{{{W14}}}checked"):
      return child.get(_w("val"), child.get(f"{{{W14}}}val", "1")) not in ("0", "false")
  return False


# ---------------------------------------------------------------- DOC (Word 97-2003)

def extract_doc(data: bytes) -> ExtractedDocument:
  if data.startswith(b"PK"):   # .doc files that are really DOCX
    return extract_docx(data)
  try:
    text = _doc_text(data)
  except Exception as exc:
    raise AppError("UNREADABLE_FILE", "Nie udało się odczytać pliku DOC", 422) from exc
  return ExtractedDocument(format=FileFormat.DOC, blocks=_doc_blocks(text))


def _doc_text(data: bytes) -> str:
  """Main text and text boxes of a Word 97+ file, read through the piece table ([MS-DOC] 2.4.1)."""
  ole = olefile.OleFileIO(io.BytesIO(data))
  word = ole.openstream("WordDocument").read()
  table = ole.openstream("1Table" if struct.unpack_from("<H", word, 0x0A)[0] & 0x0200 else "0Table").read()

  pos = 32
  csw = struct.unpack_from("<H", word, pos)[0]
  pos += 2 + csw * 2
  cslw = struct.unpack_from("<H", word, pos)[0]
  lw = struct.unpack_from(f"<{cslw}i", word, pos + 2)          # FibRgLw97
  pos += 2 + cslw * 4 + 2                                        # skip cbRgFcLcb
  fc_clx, lcb_clx = struct.unpack_from("<II", word, pos + 33 * 8)  # fcClx is entry 33 of FibRgFcLcb97

  clx = table[fc_clx:fc_clx + lcb_clx]
  i = 0
  while clx[i] == 0x01:                                          # skip Prc (property modifiers)
    i += 3 + struct.unpack_from("<H", clx, i + 1)[0]
  lcb = struct.unpack_from("<I", clx, i + 1)[0]
  plc = clx[i + 5:i + 5 + lcb]
  n = (lcb - 4) // 12
  cps = struct.unpack_from(f"<{n + 1}I", plc, 0)

  chars = []
  for k in range(n):
    fc = struct.unpack_from("<I", plc, (n + 1) * 4 + k * 8 + 2)[0]
    length = cps[k + 1] - cps[k]
    if fc & 0x40000000:
      start = (fc & 0x3FFFFFFF) // 2
      chars.append(word[start:start + length].decode("cp1252", errors="replace"))
    else:
      chars.append(word[fc:fc + 2 * length].decode("utf-16-le", errors="replace"))
  full = "".join(chars)

  ccp_text, ccp_ftn, ccp_hdd, _, ccp_atn, ccp_edn, ccp_txbx = lw[3:10]
  txbx_start = ccp_text + ccp_ftn + ccp_hdd + ccp_atn + ccp_edn
  return full[:ccp_text] + "\r" + full[txbx_start:txbx_start + ccp_txbx]


def _strip_fields(text: str) -> str:
  """Drop field instructions (\\x13 instr \\x14 result \\x15), keep results; FORMCHECKBOX becomes a box."""
  out, stack = [], []          # stack entries: [inside instruction part, instruction text, start in out]
  for ch in text:
    if ch == "\x13":
      stack.append([True, "", len(out)])
    elif ch == "\x14" and stack:
      stack[-1][0] = False
    elif ch == "\x15" and stack:
      _, instr, start = stack.pop()
      if "FORMCHECKBOX" in instr:
        out.insert(start, BOX)
    elif stack and stack[-1][0]:
      stack[-1][1] += ch
    else:
      out.append(ch)
  return "".join(out)


def _doc_blocks(text: str) -> list[Block]:
  """Split DOC text on paragraph (\\r), cell (\\x07) and page (\\x0c) marks.

  shortcut: two cell marks in a row are read as a row end, so an empty last cell can merge rows;
  exact table structure needs the TAP properties, upgrade if tables come out wrong.
  """
  text = _strip_fields(text).replace("\x0b", "\r").replace("\x1e", "-").replace("\t", " ")
  text = "".join(ch for ch in text if ch >= " " or ch in "\r\x07\x0c")
  blocks: list[Block] = []
  page, buffer, cells, rows = 1, "", [], []

  def flush_table():
    nonlocal rows
    rows = [r for r in rows if any(r)]
    if rows:
      blocks.append(Block(kind="table", rows=rows, page=page))
    rows = []

  prev = ""
  for ch in text:
    if ch == "\x07":
      if prev == "\x07" and not buffer:
        rows.append([normalize(c).replace(BOX, "[ ]") for c in cells])
        cells = []
      else:
        cells.append(buffer)
        buffer = ""
    elif ch in "\r\x0c":
      if cells:                        # paragraph break inside a table cell
        buffer += " "
      else:
        flush_table()
        block = line_block(buffer, page)
        if block:
          blocks.append(block)
        buffer = ""
      if ch == "\x0c":
        page += 1
    else:
      buffer += ch
    prev = ch
  if cells:
    rows.append([normalize(c) for c in cells])
  flush_table()
  block = line_block(buffer, page)
  if block:
    blocks.append(block)
  return blocks
