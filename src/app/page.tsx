import { getSession } from "@/lib/sessions";
import { redirect } from "next/navigation";

// A raiz não tem tela própria: é só um desvio.
//
// Quem tem sessão vai para o dashboard; quem não tem vai para o login, que é
// também a porta do PRIMEIRO ACESSO — a conta nasce no callback do LinkedIn
// (`upsertUserOnLogin`), não existe tela de cadastro separada.
//
// O proxy já barra "/" sem cookie, mas ele só sabe dizer "não entra": não tem
// como mandar para o dashboard quem TEM sessão. Sem este desvio a pessoa logada
// caía num stub em branco ao abrir a URL raiz.
export default async function Home() {
  const session = await getSession();
  redirect(session ? "/dashboard" : "/login");
}
