import { ProcessTerminal, TUI } from '@earendil-works/pi-tui';
import { InspectorComponent } from './inspector-component.js';
import { InspectorSession } from './inspector-session.js';

/** Runs the shared inspector component in a real process terminal. */
export async function runStandaloneInspector(session: InspectorSession): Promise<void> {
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  let finish: (() => void) | undefined;
  const closed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const component = new InspectorComponent(session, {
    tui,
    onClose: () => finish?.(),
  });
  try {
    tui.addChild(component);
    tui.setFocus(component);
    tui.start();
    await closed;
  } finally {
    component.dispose();
    tui.stop();
  }
}
