# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email **security@subtitleburner.com** with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive acknowledgement within 48 hours
4. A fix will be prioritized based on severity

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Security Measures

- Authentication via NextAuth.js with JWT sessions
- API key authentication with SHA-256 hashing and constant-time comparison
- Input validation with Zod schemas on all endpoints
- CSS style sanitization against injection attacks
- File upload validation with magic byte checking
- Rate limiting on resource-intensive endpoints
- CSRF protection via SameSite cookies
- Security headers (HSTS, X-Frame-Options, CSP, etc.)
