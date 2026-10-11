#!/usr/bin/env bash
# Register the Telegram webhook with its secret header, and print the WhatsApp callback URL and
# verify token to paste into the Meta developer console. Usage: ./scripts/set_webhooks.sh [stack-name]
set -euo pipefail
STACK="${1:-jaltaap}"
REGION="${AWS_REGION:-ap-south-1}"
out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
param() { aws ssm get-parameter --region "$REGION" --name "/jaltaap/$1" --with-decryption --query Parameter.Value --output text; }
TG_URL=$(out TelegramWebhookUrl)
TOKEN=$(param telegram/bot_token)
SECRET=$(param telegram/secret_token)
curl -sS "https://api.telegram.org/bot${TOKEN}/setWebhook" \
  --data-urlencode "url=${TG_URL}" --data-urlencode "secret_token=${SECRET}" \
  --data-urlencode 'allowed_updates=["message","edited_message"]'
echo
echo "WhatsApp: in Meta > WhatsApp > Configuration, set"
echo "  Callback URL: $(out WhatsAppCallbackUrl)"
echo "  Verify token: the value of /jaltaap/whatsapp/verify_token"
echo "  and subscribe the 'messages' field."
