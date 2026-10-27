# Editing the DataFixer website

The two pages in `public/` (`index.html`, `privacy.html`) are generated from `src/*.html` plus two small files, by a script that needs only Node (no packages). Whatever is committed in `public/` is published, exactly as before: nothing is built on the server.

The two files:

- `content/content.json`: all the visible wording (headline, lead, the "What makes it
  different" items, the "Coming next" line, the privacy aside, the founder note).
- `content/site.json`: the contact address, the copyright year, whether the Terms link
  shows (`terms.enabled`, only after `public/terms.html` exists) and the company details.
  The line "DataFixer is a trading name of ..." on privacy.html is hidden until
  `legal_name`, `company_number` and `registered_office` are ALL filled in. Take them from
  Companies House; do not guess.

After changing either file (or `src/`), run, in this folder:

    node build.mjs                  # rewrites public/index.html and public/privacy.html
    node --test tests/site.test.mjs # checks (copy, form untouched, claims, contrast, weight)

Then commit `public/` together with the source files and push. Do not edit `public/*.html`
by hand: the next build would overwrite it (the test fails if they differ).

