#!/usr/bin/env bash
# setup-monitoring.sh
#
# Cria log-based metrics, notification channel e Alerting Policies no
# Google Cloud Monitoring para as funções críticas do projeto saasgestaoescolar.
#
# Uso:
#   bash scripts/setup-monitoring.sh
#
# Pré-requisitos:
#   gcloud auth login
#   gcloud config set project saasgestaoescolar
#   Permissões IAM: roles/monitoring.admin + roles/logging.admin
#
# Idempotência: o script pode ser reexecutado com segurança — recursos que já
# existem são detectados e pulados sem erro.

set -euo pipefail

PROJECT="saasgestaoescolar"
REGION="southamerica-east1"
EMAIL="contato.tarciso@gmail.com"

# resource.type para Cloud Functions de 1ª geração (firebase-functions/v1)
RESOURCE_TYPE="cloud_function"
FUNCTION_LABEL="function_name"

# Funções críticas com alerta individual
CRITICAL_FUNCS=("createAbsence" "approveTeacher" "removeTeacherFromSchool" "backfillRemovedFrom")

# ── Utilidades ────────────────────────────────────────────────────────────────

log() { echo "[setup-monitoring] $*"; }

# Retorna o name do canal de email se já existir, string vazia caso contrário.
find_email_channel() {
  gcloud beta monitoring channels list \
    --project="${PROJECT}" \
    --filter="type=email AND labels.email_address=${EMAIL}" \
    --format="value(name)" \
    --limit=1 2>/dev/null || true
}

# Verifica se uma log-based metric já existe.
metric_exists() {
  local metric_name="$1"
  gcloud logging metrics describe "${metric_name}" \
    --project="${PROJECT}" &>/dev/null
}

# Verifica se uma Alerting Policy com determinado displayName já existe.
# Retorna o name (projects/.../alertPolicies/ID) ou string vazia.
find_policy() {
  local display_name="$1"
  gcloud alpha monitoring policies list \
    --project="${PROJECT}" \
    --filter="displayName=\"${display_name}\"" \
    --format="value(name)" \
    --limit=1 2>/dev/null || true
}

# ── Passo 1: Notification Channel ────────────────────────────────────────────

log "Verificando notification channel de email para ${EMAIL}..."

CHANNEL=$(find_email_channel)

if [[ -n "${CHANNEL}" ]]; then
  log "Canal já existe: ${CHANNEL}"
else
  log "Criando notification channel..."
  CHANNEL=$(gcloud beta monitoring channels create \
    --display-name="Email cisotar" \
    --type=email \
    --channel-labels="email_address=${EMAIL}" \
    --project="${PROJECT}" \
    --format="value(name)")
  log "Canal criado: ${CHANNEL}"
fi

# ── Passo 2: Log-based Metrics ───────────────────────────────────────────────

log "Criando log-based metrics para funções críticas..."

for FUNC in "${CRITICAL_FUNCS[@]}"; do
  METRIC_NAME="${FUNC}-errors"
  LOG_FILTER="resource.type=\"${RESOURCE_TYPE}\" AND resource.labels.${FUNCTION_LABEL}=\"${FUNC}\" AND severity=ERROR"

  if metric_exists "${METRIC_NAME}"; then
    log "Métrica ${METRIC_NAME} já existe, pulando."
  else
    log "Criando métrica ${METRIC_NAME}..."
    gcloud logging metrics create "${METRIC_NAME}" \
      --description="Erros severity=ERROR na função ${FUNC}" \
      --log-filter="${LOG_FILTER}" \
      --project="${PROJECT}"
    log "Métrica ${METRIC_NAME} criada."
  fi
done

# ── Passo 3: Alerting Policies individuais (log-based) ───────────────────────

log "Criando Alerting Policies individuais (janela 5 min, threshold > 0)..."

for FUNC in "${CRITICAL_FUNCS[@]}"; do
  POLICY_NAME="${FUNC}-errors"
  METRIC_TYPE="logging.googleapis.com/user/${FUNC}-errors"

  EXISTING=$(find_policy "${POLICY_NAME}")
  if [[ -n "${EXISTING}" ]]; then
    log "Policy ${POLICY_NAME} já existe (${EXISTING}), pulando."
    continue
  fi

  log "Criando policy ${POLICY_NAME}..."

  # Arquivo JSON temporário para a policy
  POLICY_JSON=$(mktemp /tmp/policy-XXXXXX.json)
  trap "rm -f ${POLICY_JSON}" EXIT

  cat > "${POLICY_JSON}" <<JSON
{
  "displayName": "${POLICY_NAME}",
  "documentation": {
    "content": "Alerta de severity=ERROR na função ${FUNC}. Consulte docs/runbook-alertas.md para diagnóstico.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "${FUNC} — erros por severity=ERROR",
      "conditionThreshold": {
        "filter": "metric.type=\"${METRIC_TYPE}\" AND resource.type=\"${RESOURCE_TYPE}\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": []
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 0,
        "duration": "0s",
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "alertStrategy": {
    "notificationRateLimit": {
      "period": "3600s"
    }
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["${CHANNEL}"]
}
JSON

  gcloud alpha monitoring policies create \
    --policy-from-file="${POLICY_JSON}" \
    --project="${PROJECT}"

  rm -f "${POLICY_JSON}"
  trap - EXIT

  log "Policy ${POLICY_NAME} criada."
done

# ── Passo 4: Alerting Policy global (execution_count com status != ok) ────────

GLOBAL_POLICY_NAME="global-function-errors"
EXISTING_GLOBAL=$(find_policy "${GLOBAL_POLICY_NAME}")

if [[ -n "${EXISTING_GLOBAL}" ]]; then
  log "Policy ${GLOBAL_POLICY_NAME} já existe (${EXISTING_GLOBAL}), pulando."
else
  log "Criando policy global ${GLOBAL_POLICY_NAME} (janela 10 min, threshold > 5)..."

  GLOBAL_JSON=$(mktemp /tmp/policy-global-XXXXXX.json)
  trap "rm -f ${GLOBAL_JSON}" EXIT

  cat > "${GLOBAL_JSON}" <<JSON
{
  "displayName": "${GLOBAL_POLICY_NAME}",
  "documentation": {
    "content": "Taxa global de execuções com falha em qualquer Cloud Function do projeto. Threshold: > 5 erros em 10 minutos. Consulte docs/runbook-alertas.md.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "Taxa global de falhas em Cloud Functions",
      "conditionThreshold": {
        "filter": "metric.type=\"cloudfunctions.googleapis.com/function/execution_count\" AND resource.type=\"cloud_function\" AND metric.labels.status != \"ok\"",
        "aggregations": [
          {
            "alignmentPeriod": "600s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": []
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 5,
        "duration": "0s",
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "alertStrategy": {
    "notificationRateLimit": {
      "period": "3600s"
    }
  },
  "combiner": "OR",
  "enabled": true,
  "notificationChannels": ["${CHANNEL}"]
}
JSON

  gcloud alpha monitoring policies create \
    --policy-from-file="${GLOBAL_JSON}" \
    --project="${PROJECT}"

  rm -f "${GLOBAL_JSON}"
  trap - EXIT

  log "Policy ${GLOBAL_POLICY_NAME} criada."
fi

# ── Resumo ────────────────────────────────────────────────────────────────────

log ""
log "============================================================"
log "Setup concluido!"
log "Notification channel : ${CHANNEL}"
log "Log-based metrics    : createAbsence-errors, approveTeacher-errors,"
log "                       removeTeacherFromSchool-errors, backfillRemovedFrom-errors"
log "Alerting Policies    : createAbsence-errors, approveTeacher-errors,"
log "                       removeTeacherFromSchool-errors, backfillRemovedFrom-errors,"
log "                       global-function-errors"
log ""
log "Verifique o estado das policies em:"
log "  https://console.cloud.google.com/monitoring/alerting?project=${PROJECT}"
log "============================================================"
