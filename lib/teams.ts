// Notificação via Incoming Webhook do canal do Teams — módulo Tickets do
// Núcleo. Diferente do sistema antigo (um canal por setor), aqui todo
// ticket cai no time de T.I., então existe um único webhook
// (TEAMS_WEBHOOK_TI) independente do "setor" escolhido na criação do
// ticket — o setor só aparece no card como contexto.

const WEBHOOK_ENV_VAR = "TEAMS_WEBHOOK_TI";

interface Destinatario {
  email: string;
  name?: string | null;
}

function linkPara(appUrl: string, sector: string) {
  return `${appUrl.replace(/\/$/, "")}/m/tecnologia/tickets?setor=${encodeURIComponent(sector)}`;
}

function displayName(r: Destinatario): string {
  return r.name || r.email.split("@")[0];
}

async function postWebhook(payload: unknown): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = process.env[WEBHOOK_ENV_VAR];
  if (!webhookUrl) {
    return { ok: false, error: `Webhook do Teams não configurado (${WEBHOOK_ENV_VAR} vazio).` };
  }
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok || res.status === 202) return { ok: true };
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `Webhook ${res.status}: ${txt.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Falha no envio" };
  }
}

// ---------------------------------------------------------------- atribuição

interface NotifyAssignParams {
  to: Destinatario[];
  ticketTitle: string;
  ticketId: string;
  sectorLabel: string;
  assignerName: string;
  appUrl: string;
}

export async function sendTeamsNotification(params: NotifyAssignParams) {
  const link = linkPara(params.appUrl, params.sectorLabel);
  const mentions = params.to.map((r) => ({
    type: "mention",
    text: `<at>${displayName(r)}</at>`,
    mentioned: { id: r.email, name: displayName(r) },
  }));
  const mentionsText = params.to.map((r) => `<at>${displayName(r)}</at>`).join(", ");

  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { entities: mentions, width: "Full" },
          body: [
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              text: "🎫 Novo ticket atribuído",
              color: "Accent",
            },
            {
              type: "TextBlock",
              text: `${mentionsText} — ${params.assignerName} atribuiu você ao ticket abaixo:`,
              wrap: true,
            },
            {
              type: "Container",
              style: "emphasis",
              bleed: true,
              items: [
                {
                  type: "TextBlock",
                  text: `[${params.sectorLabel}]`,
                  size: "Small",
                  color: "Accent",
                  weight: "Bolder",
                },
                {
                  type: "TextBlock",
                  text: params.ticketTitle,
                  size: "Large",
                  weight: "Bolder",
                  wrap: true,
                },
              ],
            },
          ],
          actions: [
            { type: "Action.OpenUrl", title: "Abrir ticket", url: link, style: "positive" },
          ],
        },
      },
    ],
  };

  const result = await postWebhook(card);
  if (result.ok) return { ok: true as const, sent_to: params.to.map((r) => r.email), error: undefined };
  return result;
}

// ---------------------------------------------------------------- finalização

interface FinalizedParams {
  ticketTitle: string;
  ticketId: string;
  sectorLabel: string;
  finalizerName: string;
  appUrl: string;
}

export async function sendFinalizedNotification(params: FinalizedParams) {
  const link = linkPara(params.appUrl, params.sectorLabel);
  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { width: "Full" },
          body: [
            {
              type: "TextBlock",
              size: "Medium",
              weight: "Bolder",
              text: "✅ Ticket finalizado",
              color: "Good",
            },
            {
              type: "TextBlock",
              text: `**${escapeText(params.finalizerName)}** finalizou o ticket abaixo:`,
              wrap: true,
            },
            {
              type: "Container",
              style: "emphasis",
              bleed: true,
              items: [
                {
                  type: "TextBlock",
                  text: `[${params.sectorLabel}]`,
                  size: "Small",
                  color: "Accent",
                  weight: "Bolder",
                },
                {
                  type: "TextBlock",
                  text: params.ticketTitle,
                  size: "Large",
                  weight: "Bolder",
                  wrap: true,
                },
              ],
            },
          ],
          actions: [{ type: "Action.OpenUrl", title: "Ver ticket", url: link }],
        },
      },
    ],
  };
  return postWebhook(card);
}

function escapeText(s: string): string {
  return s.replace(/\*/g, "\\*").replace(/_/g, "\\_");
}

// ---------------------------------------------------------------- deploy (Vercel)
// Avisa o mesmo canal de T.I. quando sai um deploy novo em produção (ou
// quando um deploy falha) — disparado por app/api/webhooks/vercel-deploy,
// que recebe o webhook configurado no dashboard da Vercel.

interface DeployNotifyParams {
  ok: boolean;
  projectName: string;
  commitMessage?: string;
  commitAuthor?: string;
  commitSha?: string;
  branch?: string;
  url: string;
}

export async function sendDeployNotification(params: DeployNotifyParams) {
  const titulo = params.ok ? "🚀 Novo deploy em produção" : "⚠️ Deploy falhou";
  const cor = params.ok ? "Good" : "Attention";
  const shaCurto = params.commitSha ? params.commitSha.slice(0, 7) : undefined;

  const detalhes: Record<string, unknown>[] = [];
  if (params.commitMessage) {
    detalhes.push({
      type: "TextBlock",
      text: params.commitMessage,
      size: "Large",
      weight: "Bolder",
      wrap: true,
    });
  } else {
    detalhes.push({ type: "TextBlock", text: params.projectName, size: "Large", weight: "Bolder", wrap: true });
  }
  const rodape = [
    params.commitAuthor ? `por **${escapeText(params.commitAuthor)}**` : null,
    shaCurto ? `commit \`${shaCurto}\`` : null,
    params.branch ? `branch \`${params.branch}\`` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (rodape) {
    detalhes.push({ type: "TextBlock", text: rodape, size: "Small", isSubtle: true, wrap: true });
  }

  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          msteams: { width: "Full" },
          body: [
            { type: "TextBlock", size: "Medium", weight: "Bolder", text: titulo, color: cor },
            { type: "Container", style: "emphasis", bleed: true, items: detalhes },
          ],
          actions: [
            { type: "Action.OpenUrl", title: params.ok ? "Ver site" : "Ver logs na Vercel", url: params.url },
          ],
        },
      },
    ],
  };

  return postWebhook(card);
}
