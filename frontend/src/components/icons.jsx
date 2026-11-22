// Stroke icons on a 24×24 grid. An icon is decorative (hidden from screen readers) unless it gets an aria-label.

function Icon({ size = 24, strokeWidth = 2, children, ...props }) {
  const isLabelled = Boolean(props["aria-label"]);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={isLabelled ? "img" : undefined}
      aria-hidden={isLabelled ? undefined : true}
      {...props}
    >
      {children}
    </svg>
  );
}

export function Accessibility(props) {
  return (
    <Icon {...props}>
      <path
        fill="currentColor"
        stroke="none"
        d="M10.5875 5.4125C10.1958 5.02083 10 4.55 10 4C10 3.45 10.1958 2.97917 10.5875 2.5875C10.9792 2.19583 11.45 2 12 2C12.55 2 13.0208 2.19583 13.4125 2.5875C13.8042 2.97917 14 3.45 14 4C14 4.55 13.8042 5.02083 13.4125 5.4125C13.0208 5.80417 12.55 6 12 6C11.45 6 10.9792 5.80417 10.5875 5.4125ZM17 22V17H12C11.45 17 10.9792 16.8042 10.5875 16.4125C10.1958 16.0208 10 15.55 10 15V9C10 8.45 10.1958 7.97917 10.5875 7.5875C10.9792 7.19583 11.45 7 12 7C12.4 7 12.7458 7.0875 13.0375 7.2625C13.3292 7.4375 13.6417 7.71667 13.975 8.1C14.8917 9.2 15.7208 9.95417 16.4625 10.3625C17.2042 10.7708 18.05 10.9833 19 11V13C18.1167 13 17.225 12.8083 16.325 12.425C15.425 12.0417 14.65 11.5833 14 11.05V14.5H17C17.55 14.5 18.0208 14.6958 18.4125 15.0875C18.8042 15.4792 19 15.95 19 16.5V22H17ZM10 22C8.61667 22 7.4375 21.5125 6.4625 20.5375C5.4875 19.5625 5 18.3833 5 17C5 15.8 5.37917 14.7417 6.1375 13.825C6.89583 12.9083 7.85 12.3333 9 12.1V14.15C8.41667 14.3833 7.9375 14.7542 7.5625 15.2625C7.1875 15.7708 7 16.35 7 17C7 17.8333 7.29167 18.5417 7.875 19.125C8.45833 19.7083 9.16667 20 10 20C10.65 20 11.2292 19.8125 11.7375 19.4375C12.2458 19.0625 12.6167 18.5833 12.85 18H14.9C14.6667 19.15 14.0917 20.1042 13.175 20.8625C12.2583 21.6208 11.2 22 10 22Z"
      />
    </Icon>
  );
}

export function ArrowUpAZ(props) {
  return (
    <Icon {...props}>
      <path d="m4 16 4-8 4 8M5.5 13h5M20 20V4M16 8l4-4 4 4M16 20h8" />
    </Icon>
  );
}

export function Check(props) {
  return (
    <Icon {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function ChevronDown(props) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function ChevronLeft(props) {
  return (
    <Icon {...props}>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  );
}

export function ChevronRight(props) {
  return (
    <Icon {...props}>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  );
}

export function CircleCheck(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </Icon>
  );
}

export function Copy(props) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Icon>
  );
}

export function Download(props) {
  return (
    <Icon {...props}>
      <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
    </Icon>
  );
}

export function ExternalLink(props) {
  return (
    <Icon {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Icon>
  );
}

export function Eye(props) {
  return (
    <Icon {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </Icon>
  );
}

export function FileQuestion(props) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M9.5 13a2.5 2.5 0 1 1 3.1 2.4c-.6.2-1.1.7-1.1 1.6M12 19h.01" />
    </Icon>
  );
}

export function FileText(props) {
  return (
    <Icon {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2" />
    </Icon>
  );
}

export function Image(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </Icon>
  );
}

export function Info(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-5M12 8h.01" />
    </Icon>
  );
}

export function Layers(props) {
  return (
    <Icon {...props}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </Icon>
  );
}

export function Minus(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

export function Pencil(props) {
  return (
    <Icon {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Icon>
  );
}

export function Plus(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function RotateCcw(props) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Icon>
  );
}

export function Trash(props) {
  return (
    <Icon {...props}>
      <path d="M3 6h18M8 6V3h8v3M19 6l-1 15H6L5 6M10 10v7M14 10v7" />
    </Icon>
  );
}

export function TriangleAlert(props) {
  return (
    <Icon {...props}>
      <path d="M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  );
}

export function Upload(props) {
  return (
    <Icon {...props}>
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </Icon>
  );
}

export function X(props) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}
