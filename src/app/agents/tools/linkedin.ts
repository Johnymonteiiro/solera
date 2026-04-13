import { LINKEDIN_MAX_CHARS } from "../constants";

export async function publishPost(content: string): Promise<string> {
  if (content.length > LINKEDIN_MAX_CHARS) {
    throw new Error(
      `Post excede o limite de ${LINKEDIN_MAX_CHARS} caracteres (atual: ${content.length})`,
    );
  }

  const accessToken = process.env.LINKEDIN_CLIENT_SECRET;
  if (!accessToken || accessToken === "...") {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[linkedin] LINKEDIN_CLIENT_SECRET não configurado — simulando publicação em dev");
      return "https://www.linkedin.com/feed/update/dev-simulation";
    }
    throw new Error("LINKEDIN_CLIENT_SECRET não configurado");
  }

  const profileUrn = await getLinkedInProfileUrn(accessToken);

  const body = {
    author: profileUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: content,
        },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      memberNetworkVisibility: "PUBLIC", // ✅ corrigido
    },
  };

  const response = await fetch(`${process.env.LINKEDIN_API_BASE}/ugcPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 401) {
    throw new Error(
      "LinkedIn access token expirado (validade: 60 dias). Renove o token em LINKEDIN_CLIENT_SECRET.",
    );
  }

  if (response.status === 403) {
    throw new Error(
      "Sem permissão para publicar. Verifique se o token tem o scope 'w_member_social'.",
    );
  }

  if (response.status === 429) {
    throw new Error("LinkedIn API rate limit atingido. Tente novamente em alguns minutos.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LinkedIn API error ${response.status}: ${errorText}`);
  }

  const postUrn = response.headers.get("x-restli-id"); // ✅ corrigido
  if (!postUrn) throw new Error("LinkedIn não retornou o ID do post.");
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}`;
}

async function getLinkedInProfileUrn(accessToken: string): Promise<string> {
  const response = await fetch(`${process.env.LINKEDIN_API_BASE}/me`, { // ✅ corrigido
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    throw new Error("LinkedIn access token expirado.");
  }

  if (!response.ok) {
    throw new Error(`Erro ao buscar perfil LinkedIn: ${response.status}`);
  }

  const data = await response.json() as { id: string }; // ✅ corrigido
  return `urn:li:person:${data.id}`;
}