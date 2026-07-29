# Ideioworld Panel

A **local system** for Ideioworld's marketing team to collect, manage and
search business data — for both **Business** and **Mobile Hut** — in one place.

Runs entirely on your own machine. All data (records + uploaded logos,
documents and images) is stored locally in this folder. Nothing goes to the
cloud.

---

## What you can do

- 🔐 **Login** — single shared Ideioworld account protects the panel.
- 🏬 **Business Data** and 📱 **Mobile Hut** — two separate modules.
- ➕ **Add / 👁 View / ✏️ Edit / 🗑 Delete** records.
- 🔍 **Search** by name, owner, contact, location, category, GST, notes.
- 🧮 **Filter** by category and lead status.
- 📊 **Dashboard** — live counts, lead pipeline and top categories.
- 🏷 **Lead pipeline** — New Lead → Contacted → Interested → Onboarded.
- 📝 **Follow-up notes** per record.
- 🖼 **Uploads** — business logo/photo, a document (PDF/image), and up to 12 images.
- 🗺 **Map link** generated from the location field.
- ⬇ **Export CSV** for mail-merge / campaigns.

### Business fields
Business Name*, Owner Name, Contact No., Email ID, Location, Description,
Category, Business Type, GST No., Lead Status, Timings, Menu / Services,
Any Deal / Offer, Follow-up Notes, Business Logo/Photo, Business Document,
Business Images.

### Mobile Hut fields
Mobile Hut Name*, Owner Name, Phone Number, Type, Location, Description,
Open / Close Timing, Start Date, Closed Days, Permanent or Move Around,
Lead Status, Services / Menu, Follow-up Notes, Owner Photo, Mobile Hut Logo,
Mobile Hut Photos.

### Your logo
Drop your Ideioworld logo at `public/img/logo.png` and it replaces the
built-in wordmark on the sidebar and login screen automatically (see
`public/img/README.txt`).

---

## Run it

Requirements: **Node.js 18+** (tested on Node 22).

```bash
npm install
npm start
```

Then open **http://localhost:4000** in your browser.

**Default login:** `admin` / `ideioworld`

> ⚠️ Change the login before real use — see below.

---

## Change the login / port

Set environment variables (recommended) or edit `src/config.js`.

Using an env file (Node 20+):

```bash
cp .env.example .env      # then edit .env
node --env-file=.env src/server.js
```

Or inline:

```bash
IDEIO_USER=ideio IDEIO_PASSWORD=SuperSecret PORT=5000 npm start
```

---

## Where is my data?

- Database: `data/ideioworld.db` (SQLite)
- Uploaded files: `uploads/`

Both folders are created automatically and are **git-ignored** so your data
is never committed. To back up, just copy the `data/` and `uploads/` folders.

---

## Project structure

```
src/
  config.js     app settings, login, dropdown options
  db.js         SQLite schema + connection
  server.js     Express server + REST API + file uploads
public/
  login.html    login screen
  index.html    app shell
  css/style.css Ideioworld-branded UI
  js/app.js     dashboard, tables, forms, search, detail views
```

---

## Theme

The interface uses the Ideioworld brand colours — teal, ocean blue and orange —
taken from the logo, with the "Discover the World Around You" tagline on login.
