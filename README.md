# HamroAI Vercel Wrapper

Static frontend + Vercel serverless API wrapper for the public Hugging Face Space.

## Deploy on Vercel

1. Push this folder to your GitHub repository.
2. In Vercel, import the repository.
3. Set the Root Directory to `vercel_wrapper`.
4. Deploy.

Optional environment variables in Vercel project settings:

- `HAMROAI_SPACE_BASE_URL` (default: `https://darksunnp-hamroai.hf.space`)
- `HAMROAI_API_NAME` (default: `/generate`)

## Local preview

You can run this with Vercel CLI:

```bash
npm i -g vercel
vercel dev
```
