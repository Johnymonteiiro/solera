import { LINKEDIN_MAX_CHARS } from "../constants";

// Versão da Posts API. LinkedIn versiona via header `LinkedIn-Version: YYYYMM`.
// 202509 = setembro/2025, estável até pelo menos 12 meses.
const LINKEDIN_VERSION = "202509";
const REST_BASE = "https://api.linkedin.com/rest";

function escapeLittleText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([_|(){}[\]@#*~<>])/g, "\\$1");
}

export async function publishPost(
  content: string,
  accessToken: string,
): Promise<string> {
  if (content.length > LINKEDIN_MAX_CHARS) {
    throw new Error(
      `Post excede o limite de ${LINKEDIN_MAX_CHARS} caracteres (atual: ${content.length})`,
    );
  }

  if (!accessToken) {
    throw new Error(
      "Sessão LinkedIn ausente. Faça login com LinkedIn antes de publicar.",
    );
  }

  const profileUrn = await getLinkedInProfileUrn(accessToken);

  const body = {
    author: profileUrn,
    commentary: escapeLittleText(content),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };

  const serializedBody = JSON.stringify(body);
  console.log(
    `[linkedin] POST ${REST_BASE}/posts body=${serializedBody.slice(0, 400)}`,
  );

  const response = await fetch(`${REST_BASE}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: serializedBody,
  });

  if (response.status === 401) {
    throw new Error(
      "Token LinkedIn expirado ou inválido. Faça login novamente.",
    );
  }

  if (response.status === 403) {
    throw new Error(
      "Sem permissão para publicar. Verifique se o token tem o scope 'w_member_social'.",
    );
  }

  if (response.status === 429) {
    throw new Error(
      "LinkedIn API rate limit atingido. Tente novamente em alguns minutos.",
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn API error ${response.status}: ${errorText}`);
  }

  // Posts API retorna o URN no header x-restli-id (ex: urn:li:share:7286...)
  const postUrn = response.headers.get("x-restli-id");
  if (!postUrn) throw new Error("LinkedIn não retornou o ID do post.");

  // Verificação: busca o post de volta pra confirmar visibility e
  // feedDistribution que o LinkedIn aplicou. Útil pra debug — se o LinkedIn
  // sobrescrever os campos, a gente vê no log.
  try {
    const verifyRes = await fetch(
      `${REST_BASE}/posts/${encodeURIComponent(postUrn)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": LINKEDIN_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
      },
    );
    if (verifyRes.ok) {
      const data = (await verifyRes.json()) as {
        visibility?: unknown;
        distribution?: unknown;
        lifecycleState?: unknown;
      };
      console.log(
        `[linkedin] verify visibility=${JSON.stringify(data.visibility)} distribution=${JSON.stringify(data.distribution)} lifecycleState=${data.lifecycleState}`,
      );
    } else {
      console.warn(
        `[linkedin] verify falhou: ${verifyRes.status} ${verifyRes.statusText}`,
      );
    }
  } catch (err) {
    console.warn(`[linkedin] verify exception:`, err);
  }

  return `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}`;
}

async function getLinkedInProfileUrn(accessToken: string): Promise<string> {
  // /v2/userinfo (OpenID Connect) — funciona com scope "openid profile".
  // Retorna `sub` que vira urn:li:person:{sub}.
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    throw new Error("Token LinkedIn expirado ou inválido.");
  }

  if (!response.ok) {
    throw new Error(`Erro ao buscar perfil LinkedIn: ${response.status}`);
  }

  const data = (await response.json()) as { sub: string };
  if (!data.sub) {
    throw new Error(
      "Perfil LinkedIn sem 'sub' — verifique o scope 'openid profile'.",
    );
  }
  return `urn:li:person:${data.sub}`;
}
