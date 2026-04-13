# image-gen — Social Media Image Generator

Generate pixel-perfect social media graphics from HTML/CSS templates via a simple REST API.
Part of the [ReelStack](https://github.com/jurczykpawel/reelstack) open-source project.

## Quick start

```bash
# 1. Create .env
echo "API_KEY=your-secret-key" > .env

# 2. Run
docker compose up
```

API is available at `http://localhost:8000`.

## API

### Generate image

```bash
curl -X POST http://localhost:8000/generate \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"brand":"example","template":"quote-card","size":"post","text":"Ship it.","attr":"— Engineer"}' \
  -o output.png
```

**Body params:**

| Param      | Required | Description                                                             |
| ---------- | -------- | ----------------------------------------------------------------------- |
| `brand`    | yes      | Brand name (built-in or uploaded)                                       |
| `template` | yes      | Template name                                                           |
| `size`     | no       | `post` (1080x1080), `story` (1080x1920), `youtube` (1280x720), or `WxH` |
| `text`     | no       | Main quote/body text                                                    |
| `attr`     | no       | Attribution / author                                                    |
| `title`    | no       | Title text                                                              |
| `badge`    | no       | Badge label                                                             |
| `cta`      | no       | Call-to-action text                                                     |
| `num`      | no       | Series number                                                           |

### List templates

```bash
curl http://localhost:8000/templates
```

### List brands

```bash
curl http://localhost:8000/brands \
  -H "Authorization: Bearer your-secret-key"
```

### Upload custom brand

```bash
curl -X POST http://localhost:8000/brands/mybrand \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: text/css" \
  --data-binary @mybrand.css
```

### Delete brand

```bash
curl -X DELETE http://localhost:8000/brands/mybrand \
  -H "Authorization: Bearer your-secret-key"
```

## Built-in templates

| Template        | Description                    |
| --------------- | ------------------------------ |
| `quote-card`    | Quote with attribution         |
| `tip-card`      | Tip with badge                 |
| `ad-card`       | Ad/promo card                  |
| `announcement`  | Announcement card              |
| `webinar-cover` | Webinar cover                  |
| `webinar-point` | Webinar slide point            |
| ...and more     | `GET /templates` for full list |

## Built-in brands

- `example` — light theme, teal accent
- `techskills` — TechSkills Academy
- `fundacja` — Fundacja Wsparcie i Rozwój

## Custom brands

Brands are CSS files using `--brand-*` custom properties. See [`packages/image-gen/brands/_template.css`](../../packages/image-gen/brands/_template.css) for the full template with all available tokens.

Upload via `POST /brands/:name` or mount a directory via `BRANDS_DIR` env var.

## Configuration

| Env var      | Required | Default         | Description                              |
| ------------ | -------- | --------------- | ---------------------------------------- |
| `API_KEY`    | yes      | —               | Bearer token for authenticated endpoints |
| `PORT`       | no       | `8000`          | HTTP port                                |
| `BRANDS_DIR` | no       | `./data/brands` | Directory for user-uploaded brands       |

## Build locally

```bash
# From repo root
docker build -f apps/image-gen-server/Dockerfile -t image-gen .
docker run -p 8000:8000 -e API_KEY=mykey image-gen
```
