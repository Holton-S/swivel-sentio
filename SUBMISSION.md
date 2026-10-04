# Submission draft (Devpost-style fields)

Copy each section into the matching field. Revise freely.

---

## Project name
Swivel Sentio

## Tagline (one line, ~60 characters)
Is this really you? A pause before scammers get paid.

## Links
- **Try it:** https://isthisreallyyou.biz (Emily's phone: https://isthisreallyyou.biz/emily.html). Live while the demo laptop is running.
- **Code:** https://github.com/Holton-S/swivel-sentio
- **Demo video:** _(add link if the submission requires one)_

## Built with (tags)
javascript, node.js, express, html, css, google-gemini, elevenlabs, tiger-data, timescaledb, postgresql, cloudflare, ntfy, web-bluetooth, face-api, tensorflow.js

## Challenges / tracks to select
Best Overall · Swivel (Social Engineering Shield) · Best Use of Gemini API · Best Use of ElevenLabs · Best Use of Tiger Data · Best Design · CyberJedis · Best Domain Name from GoDaddy Registry

---

## Inspiration
Scams against older adults all run on the same script: **fear, urgency, and secrecy**. A fake IRS agent threatens arrest. A "grandson" needs bail money and begs you not to tell his mom. A text says your package is stuck until you pay $1.99. The victim pays before anyone they trust can say *wait*. Banks catch fraud **after** the money moves. We wanted to add one calm moment of friction **before** it moves, at the exact moment scammers count on there being none. The question we want every grandparent to ask is our domain: **is this really you?**

## What it does
Swivel Sentio is a quiet companion on Granddad's screen and a safety line to his family.

1. **It reads the call or text.** Google Gemini scores how likely it is to be a scam, names the type (grandparent scam, delivery-fee phishing…), and explains why in plain words.
2. **It notices how he's reacting.** An optional on-device camera check-in reads his expression (Calm, Uneasy, Worried, Scared), and an optional heart monitor reads his pulse. A scared face or racing heart raises the risk.
3. **It pauses the payment and calms him down.** His screen gently takes over ("Take a deep breath. We've paused this payment."), and an ElevenLabs voice talks him through it without repeating the scammer's threats.
4. **It asks family.** His daughter Emily's real phone buzzes. She sees the amount, the scam type, Gemini's explanation, and how he looks. **Veto is one tap. Approve takes two deliberate taps and never works from the lock screen.** His screen updates the instant she decides.
5. **It remembers.** Every payment checked (safe or not), every stress reading, and every family decision is stored in Tiger Data as time-series history.

There's also a **"Family check on every money request"** setting: because scammers can spoof a family member's number, families can require a check on *any* message asking for money, even one that sounds normal.

## How we built it
- **Node.js + Express** backend, plain **HTML/CSS/JS** frontend (no framework), with two experiences: Granddad's calm companion screen and Emily's phone page.
- **Google Gemini (`gemini-2.5-flash`)** with structured JSON output for the scam score, type, quoted pressure phrases, and a plain-language explanation. It's fused with offline keyword rules so the shield still works with no network.
- **ElevenLabs** text-to-speech for the calming voice, with scripts written for someone already frightened. Each clip is generated once and cached.
- **Tiger Data (Tiger Cloud / TimescaleDB):** hypertables for stress readings, scam incidents and every payment check, a real-time **continuous aggregate** for per-minute stress, and persisted caregiver decisions.
- **face-api (TensorFlow.js)** runs expression detection entirely in the browser; video never leaves the device.
- **Web Bluetooth** with the standard Heart Rate service for real heart-rate monitors, plus a clearly labeled demo monitor.
- **ntfy** for real push notifications, and a **Cloudflare Tunnel** on our **GoDaddy Registry domain** so Emily's phone works from anywhere.

## Challenges we ran into
- **Webcam pulse wasn't reliable.** Our first browser heart-rate-from-camera estimate kept resetting with normal movement and lighting. We switched to facial expression (much more robust on a laptop camera) and made heart rate a proper Bluetooth proof of concept instead of faking it.
- **The voice was scaring people.** Our first calming script literally repeated "IRS" and "arrest" back to the person. We rewrote every script to reassure first and never echo the threat, and added a test to keep it that way.
- **Making two devices agree in real time.** Granddad's laptop and Emily's phone had to share one live decision, so we moved the alert state to the server and had both sides follow it.
- **Campus Wi-Fi blocked our tunnel's default protocol (QUIC/UDP)**, so we switched it to HTTP/2.
- **Being honest about what's simulated.** We label every simulated signal in the UI and README.

## Accomplishments we're proud of
- A real, end-to-end moment: **a scam call on the laptop makes a real phone buzz, one tap vetoes it, and the laptop updates instantly.**
- **Safety-first design choices:** asymmetric veto/approve, no lock-screen approvals, spoof-resistant family checks, and every service failing *closed*, never open.
- Gemini, ElevenLabs and Tiger Data are **really integrated**, with cost guards so a demo can't run up a bill.

## What we learned
- Designing for a frightened person is different from designing for an alert: short sentences, reassurance first, no alarming words.
- Adding friction at the right moment protects people more than detection alone does.
- Time-series data fits naturally with safety monitoring, and continuous aggregates make dashboards cheap.

## What's next for Swivel Sentio
- A **native phone app** that can screen real calls and texts automatically.
- **Presage's camera vitals SDK** for clinical-grade heart rate and breathing without a wearable.
- Bank and card integrations, so the pause is a real hold on the payment.
- A trusted-circle of several family members, and Spanish-language support for the voice.
