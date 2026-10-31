# Iridium

An AI chat app where signed-in users hold threads with an assistant that can read and write their notes.

## Language

**Thread**:
One user's chat with the assistant: its title, chosen model, and the messages the user sees. It is the source of truth for what was said.
_Avoid_: Conversation, chat, session

**Thread memory**:
The assistant's own copy of a Thread's history, used as model context. It is a cache: it can always be rebuilt from the Thread, and forgetting it loses nothing the user can see.
_Avoid_: Memory thread, conversation memory

**Turn**:
One user message and the assistant reply it produces, saved to the Thread when the reply finishes or is stopped.
_Avoid_: Exchange, request

**Title**:
A Thread's short name, chosen once from its first Turn. Until then the Thread is Untitled.
_Avoid_: Name, subject

**Regenerate**:
Replacing a Thread's last assistant reply with a new one for the same user message.
_Avoid_: Retry, redo

**Forget**:
Dropping a Thread's memory (or all of a user's) so it is rebuilt from the Thread on the next Turn, or never again if the Thread is gone.
_Avoid_: Clear, reset
