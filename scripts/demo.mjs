// Tiny runnable demo (npm start) — exercises the service directly in-process.
// Not a server or HTTP route (none exists in this slice, by design — see
// runs/greenfield/05-arch.md §5): just a local script over the pure service
// functions, for a human to eyeball the shape of a HabitView.
import { createHabit, logCompletion, listHabits } from "../src/services/habits.js";

const userId = "demo-user";

const created = createHabit(userId, "Meditate");
console.log("Created habit:", created);

const logged = logCompletion(userId, created.habitId);
console.log("Logged today:", logged);

const again = logCompletion(userId, created.habitId);
console.log("Same-day re-log (idempotent, changed=false):", again);

console.log("listHabits(userId):", listHabits(userId));
