/**
 * Dono usado pelos scripts de linha de comando.
 *
 * Os stores exigem `ownerId` como primeiro parâmetro, e um script não tem
 * sessão. `OWNER_ID` no .env.local é o mesmo valor de `runs.owner_id` — o
 * `linkedinId` que sai de GET /api/auth/me com você logado.
 *
 * Falha alto de propósito: um default silencioso ("", ou o primeiro dono do
 * banco) faria o script rodar contra o conjunto errado de execuções e devolver
 * "0 execuções" como se fosse resultado.
 */
export function ownerFromEnv(): string {
  const id = process.env.OWNER_ID?.trim();
  if (!id) {
    console.error(
      "OWNER_ID não definido no .env.local.\n" +
        "É o seu linkedinId — pegue em GET /api/auth/me com a sessão aberta,\n" +
        "o mesmo valor que está em runs.owner_id.",
    );
    process.exit(1);
  }
  return id;
}
