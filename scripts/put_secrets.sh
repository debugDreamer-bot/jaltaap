#!/usr/bin/env bash
# M0: store every secret as an SSM SecureString under /jaltaap/. Values are typed at the prompt
# (never passed as arguments, never written to disk). Re-run any time to rotate a value.
set -euo pipefail
REGION="${AWS_REGION:-ap-south-1}"
put() {  # name, prompt
  local value
  read -r -s -p "$2: " value; echo
  if [[ -z "$value" ]]; then echo "  skipped $1"; return; fi
  aws ssm put-parameter --region "$REGION" --name "/jaltaap/$1" --type SecureString --overwrite --value "$value" >/dev/null
  echo "  saved /jaltaap/$1"
}
echo "Leave a value empty to skip it."
put whatsapp/token            "WhatsApp permanent (System User) access token"
put whatsapp/app_secret       "Meta app secret (App settings > Basic)"
put whatsapp/verify_token     "WhatsApp webhook verify token (any random string you also paste into Meta)"
put whatsapp/phone_number_id  "WhatsApp test number Phone Number ID"
put telegram/bot_token        "Telegram bot token from @BotFather"
put location/places_api_key   "Amazon Location Places API key value (stack output PlacesKeyName)"
put eval_token                "Eval token (random string; lets run_evals.py see tool calls)"
put officer_emails            'Optional officer alert emails as JSON, e.g. {"PWD": ["you@example.org"]} (SES-verified)'
if ! aws ssm get-parameter --region "$REGION" --name /jaltaap/hash_salt >/dev/null 2>&1; then
  aws ssm put-parameter --region "$REGION" --name /jaltaap/hash_salt --type SecureString --value "$(openssl rand -hex 32)" >/dev/null
  echo "  generated /jaltaap/hash_salt (never change it: user ids depend on it)"
fi
if ! aws ssm get-parameter --region "$REGION" --name /jaltaap/telegram/secret_token >/dev/null 2>&1; then
  aws ssm put-parameter --region "$REGION" --name /jaltaap/telegram/secret_token --type SecureString --value "$(openssl rand -hex 24)" >/dev/null
  echo "  generated /jaltaap/telegram/secret_token"
fi
