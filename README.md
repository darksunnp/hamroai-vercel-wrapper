# HamroAI Vercel Wrapper
Static frontend + Vercel serverless API for a Nepali chatbot.

## Deploy on Vercel

1. Push this folder to your GitHub repository.
2. In Vercel, import the repository.
3. Set the Root Directory to `vercel_wrapper`.
4. Deploy.

Optional environment variables in Vercel project settings:

- `HF_INFERENCE_TOKEN` (required)
- `HAMROAI_CHAT_MODEL` (default: `Qwen/Qwen2.5-7B-Instruct:fastest`)
- `HAMROAI_SYSTEM_PROMPT` (optional custom system instruction)

## Local preview

You can run this with Vercel CLI:

```bash
npm i -g vercel
vercel dev
```
