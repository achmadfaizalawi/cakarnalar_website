# Cakar Nalar

An online learning platform (LMS) for critical thinking and anti-disinformation
literacy education. Participants learn through per-chapter modules (video/PDF
material plus quizzes), a Diagnostic Test, and a Final Tryout, with results
classified according to the Paul & Elder critical thinking stages. There is
also an admin panel for managing all content and monitoring participant
progress.

## Features

**Participant**
- Registration and login, with a "Remember me" option (email and password
  saved to the device's localStorage).
- Per-chapter material: video (direct upload or YouTube link) and PDF/PPT
  files, with sequential chapter locking (the next chapter only unlocks after
  the previous chapter's quiz is passed).
- Diagnostic Test (at the start) and Final Tryout (at the end, once all
  chapters are passed), with a countdown timer and automatic result
  classification.
- Completion certificate and a feedback form after finishing the entire
  program.

**Admin**
- Manage Chapters & Materials (video/PDF, with an upload progress bar).
- Manage Questions (per-chapter quizzes, Diagnostic Test, Final Tryout) with
  custom points per question and drag-and-drop reordering.
- Participant Monitor (real-time progress, auto-refreshing every 30 seconds)
  and User Management.
- Export participant reports and feedback to `.xlsx`.
- Configure test duration and instructions.

## Tech Stack

- **Backend:** PHP + MySQL (mysqli, prepared statements)
- **Frontend:** Vanilla JavaScript, Bootstrap, SweetAlert2
- **Database:** MySQL/MariaDB (full schema in `schema.sql`)

## Project Structure

```
├── api/                # Backend endpoints (participant) + api/admin (admin panel)
├── assets/              # Logo & mascots
├── css/, js/            # Frontend per page
├── uploads/             # Uploaded material files (gitignored)
├── schema.sql           # Full database schema
├── *.html               # Pages (index, dashboard, admin, etc.)
```

## Local Setup (Development)

1. Set up MySQL/MariaDB, create a new database, then import `schema.sql`.
2. Copy `api/config.example.php` to `api/config.php`, then fill in your
   local database credentials:
   ```php
   $db_host = "localhost";
   $db_user = "root";
   $db_pass = "";
   $db_name = "your_database_name";
   ```
3. Run it with PHP's built-in server from the project root:
   ```
   php -S 127.0.0.1:8000
   ```
4. Open `http://127.0.0.1:8000/index.html` in your browser.

## Production Deployment

This project is designed for shared hosting (cPanel, e.g. Rumahweb) with no
build step required. Just upload the entire project folder to `public_html`
(or its subdomain), create a MySQL database through cPanel, import
`schema.sql`, then fill in `api/config.php` with the production database
credentials.

**Never commit an `api/config.php` containing real credentials.** This file
is already excluded via `.gitignore`; use `api/config.example.php` as a
reference for its structure.

## License

See [LICENSE](LICENSE).
