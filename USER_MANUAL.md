# CodeXray — User Manual (for everyone)

## CodeXray — Finally See What Your Code Is Actually Doing

As a vibe coder, be honest — do you actually know what your AI agent just wrote
into your codebase? One prompt turns into ten files, and suddenly you're not
building, you're guessing. Something breaks, and you burn hours hunting through
files with zero end-to-end view of your own system.

CodeXray ends that blind debugging.

It turns your entire codebase into a live, interactive **code map** — a visual
mind map of every file, module, and connection, automatically laid out so you can
see your whole architecture at a glance. Follow the **data flow diagram** step by
step to see exactly how information travels from your UI to your backend to your
database — in the order it actually happens.

Watch a real-time **traffic heat map** light up as your app runs — hot paths glow
red, quiet ones stay cool, so you instantly know which parts of your system are
doing the heavy lifting.

No more guessing what's working. Every component is color-coded — 🟢 working,
🟠 at risk, 🔴 broken — with a plain-English reason why, updated live from your
running app. One glance tells you exactly where to look.

**Stop debugging blind. Start seeing your code end-to-end — as it really behaves,
not just how it's written.**

---

## In one line

CodeXray turns any software project into a **live picture**. Instead of reading
code, you see coloured cards (the parts of the app) connected by arrows (how data
moves). Green means healthy, orange means shaky, red means broken. When the app is
running, the busy paths light up like a traffic map.

You do **not** need to know how to code to use this.

---

## What you need (one-time, 2 minutes)

Just one thing: **Node.js**.

1. Go to **[nodejs.org](https://nodejs.org)**
2. Click the big **"LTS"** download button.
3. Open the downloaded file and click Next/Install until it finishes.

That's it. You only ever do this once.

---

## How to start it (one step)

### The easy way — double-click

1. Open the `CodeXray` folder in Finder.
2. **Double-click `start.command`.**
3. A black window opens and does its thing. After a few seconds your web browser
   opens automatically at **[localhost:3001](http://localhost:3001)** — that's your dashboard. 🎉

> First time only: it spends a minute setting itself up. Every time after that it
> starts in a few seconds.

### The typed way (if you prefer a terminal)

Open Terminal, then run these two lines:

```bash
cd path/to/CodeXray
npm start
```

Then open **[localhost:3001](http://localhost:3001)** in your browser.

---

## How to stop it

Go back to the black window (or Terminal) and press **Control + C**. Or just close
the window.

---

## What you'll see

- **Cards** = the real files/parts of the project. Bigger card = more important.
- **Colours** = health: 🟢 working · 🟠 at risk · 🔴 broken.
- **Arrows** = how information flows between parts.
- **Top-right pill**:
  - **LIVE** = it's connected to a running app and showing real-time traffic.
  - **OFFLINE** = the picture still shows, but no live traffic (see below).
- **Hover any card** to read a plain-English note about what it does and why it matters.
- Drag the background to move around; use the **+ / −** buttons to zoom.

---

## "It says OFFLINE — is it broken?"

No. The map always works on its own. **LIVE** only turns on when the app you're
looking at is also running and reporting its activity. If you just want to explore
the picture, OFFLINE is perfectly fine.

To see live traffic, start the project's backend too (a developer usually sets this
up once). CodeXray then lights up automatically within a second.

---

## Frequently asked

**Do I need the internet?** Only for the one-time Node.js download. After that it
runs fully on your own computer.

**Is my code sent anywhere?** No. Everything runs locally on your machine.

**The browser didn't open by itself.** Just type **[localhost:3001](http://localhost:3001)**
into your browser's address bar.

**"Port 3001 is in use".** CodeXray is probably already running in another window.
Open [localhost:3001](http://localhost:3001), or close the other window and start again.

**I want a developer to make it show live data for our app.** Point them to
[`.github/copilot-instructions.md`](.github/copilot-instructions.md) — an AI
assistant reads it and wires everything up automatically.
