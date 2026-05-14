export interface ChatCommand {
  command: string;
  description: string;
  syntax: string;
  args?: string;
}

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    command: "/reset",
    description: "Reset the current session and clear context.",
    syntax: "/reset"
  },
  {
    command: "/clear",
    description: "Clear the chat history in the UI.",
    syntax: "/clear"
  },
  {
    command: "/model",
    description: "Switch to a different model.",
    syntax: "/model <model-id>",
    args: "<model-id>"
  },
  {
    command: "/mode",
    description: "Change the agent approval mode.",
    syntax: "/mode <default|auto_edit|yolo|plan>",
    args: "<default|auto_edit|yolo|plan>"
  },
  {
    command: "/sandbox",
    description: "Toggle sandbox mode.",
    syntax: "/sandbox <on|off>",
    args: "<on|off>"
  },
  {
    command: "/help",
    description: "Show the list of available commands.",
    syntax: "/help"
  }
];
