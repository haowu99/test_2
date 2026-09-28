# Speech Script — Simple Version
(Read each line slowly. Pause at every period.)

---

## Slide 1 — Title
Hi everyone. Thank you for your time today.
I will show you my work on the Product Rules feature.
It lets a company block items, like alcohol, from reimbursement.
I will keep this short, then show a live demo.

---

## Slide 2 — The Core Idea
Here is the main idea.
A rule can change any time.
But once we save an invoice, it never changes again.
So old invoices always keep the correct warning.

---

## Slide 3 — Why This Is Hard
This feature touches six parts of the system.
If two parts do not agree, we get wrong numbers.
There are three risks.
One — company data must stay separate.
Two — preview and save must always agree.
Three — keyword matching has some tricky cases.

---

## Slide 4 — Data Model
On the left, you see rules. These can change any time.
On the right, a saved invoice. This is frozen. It never changes.
We copy the rule name into the invoice.
So the warning stays correct, even if the rule is deleted later.

---

## Slide 5 — One Rule, Many Codes
One more update, based on team feedback.
Alcohol is not one NCM code — beer, wine, and spirits each have a different one.
So now, one rule can hold a list of codes, not just one.
We also rely mainly on the NCM code, not just a keyword. The NCM code cannot be hidden or changed by an employee. This closes a real loophole.

---

## Slide 6 — How It Works
This is the full flow, in five steps.
Admin creates a rule.
Employee scans an invoice.
The app shows a warning.
User clicks save — the system checks the rules again.
Then we send the correct amount to the ERP.

---

## Slide 7 — What I Built
I built all six parts.
I wrote sixty-nine tests. All of them pass.

---

## Slide 8 — Live Demo
Now let me show you live.
First, I create a rule.
Second, I scan an invoice. You will see the warning.
Third, I click save.

---

## Slide 9 — Being Honest
I want to be honest about two things.
I never saw your real database file.
I used a simple test login, not your real one.
Both are written clearly in my notes.

---

## Slide 10 — One Question for the Team
Before I finish, I have one question.
If two active rules match the same item, which rule should win?
I already made this behavior deterministic in the demo.
But the task did not say, so I want to confirm.

---

## Slide 11 — Thank You
Thank you for your time.
I am happy to answer any questions.

---

### Tips for tomorrow
- Speak slowly. Short sentences are fine.
- Pause after each sentence. Silence is okay.
- If you forget a word, just look at the slide — the slide already has the words.
- You do not need to say everything above word for word. The slide + a few simple words is enough.
