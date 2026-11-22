export { cn } from "cn";

/** Props that make a non-button element act as a button: clickable, focusable, activated by Enter and Space. */
export function buttonProps(onActivate) {
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown(event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate(event);
      }
    },
  };
}
