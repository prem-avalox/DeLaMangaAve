# Delamanga CMS Model

The CMS starts as a local SQLite database and keeps the public static data files as publication output.

## Access Model

`visitor` is the public role. It can read published content.

`admin` is the local owner role. It can create, update, delete, upload media, and publish.

The database already has `roles`, `permissions`, `role_permissions`, and `users`. The first user is a reserved local administrator without a password hash. Real login can be added later without changing the content model.

## Core Entities

- `media_assets`: every local file used by the site: audio, image, video, downloads, and generic files.
- `music_archives`: singles, EPs, albums, or future release pages.
- `tracks`: ordered audio tracks attached to a music archive.
- `archive_sections`: reusable visual/text/player sections attached to a music archive.
- `archive_links`: Spotify, Apple Music, or external release links.
- `downloads`: downloadable release bundles or files.
- `collections`: photography, video, service, or project collections.
- `collection_tags`: ordered tags for collections.
- `collection_items`: ordered media pieces inside collections.

## Current Publication Flow

1. `admin.html` loads editable content from SQLite through `GET /api/cms/content`.
2. The admin posts normalized entities to `POST /api/cms/content`.
3. `cms-db.js` stores the entities in SQLite as the editing source of truth.
4. `server.js` regenerates `data/music.js` or `data/collections.js` from SQLite.
5. The public pages continue reading the generated JS files.

This keeps the current web stable while making SQLite the source used by the CMS.
