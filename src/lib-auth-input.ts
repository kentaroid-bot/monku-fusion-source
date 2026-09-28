// Brave 1.95 crash reports show native address suggestions just before exit.
// This mitigates the suspected trigger without claiming a browser-level fix. Keep the
// workaround inside the auth form; never change browser settings or passwords.
// Clerk renders these fields asynchronously and can replace them between steps.
export function suppressAddressSuggestions(root: HTMLElement): () => void {
  const selector = 'input[name="emailAddress"], input[name="identifier"]';
  function apply() {
    root.querySelectorAll<HTMLInputElement>(selector).forEach((input) => {
      if (input.type !== "password" && input.autocomplete !== "off")
        input.autocomplete = "off";
    });
  }
  const observer = new MutationObserver(apply);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["autocomplete", "name", "type"],
  });
  root.addEventListener("focusin", apply, true);
  root.addEventListener("pointerdown", apply, true);
  apply();
  return () => {
    observer.disconnect();
    root.removeEventListener("focusin", apply, true);
    root.removeEventListener("pointerdown", apply, true);
  };
}
