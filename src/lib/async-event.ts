/** React events return void. The mutation's action toast has already shown failures. */
export function finishAction(action: Promise<unknown>): void {
  void action.catch(() => {});
}
