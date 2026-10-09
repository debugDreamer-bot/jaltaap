# Sample events for `sam local invoke`

Real-shaped payloads (spec 13.2). The WhatsApp ones are signed with the local app secret in
`env.json`, so the signature check passes locally:

    sam build
    sam local invoke WhatsAppWebhookFn -e events/whatsapp_text.json --env-vars events/env.json
    sam local invoke TelegramWebhookFn -e events/telegram_text.json --env-vars events/env.json
    sam local invoke AgentWorkerFn -e events/sqs_worker_text.json      # needs real AWS resources and Bedrock

`env.json` holds throwaway local values only. Real secrets live in SSM Parameter Store.
