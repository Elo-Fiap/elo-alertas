import { execFileSync } from 'node:child_process';

/** Antes de tudo: aplica as migrações no banco de teste (o Prisma cria o banco se faltar). */
export default function preparar(): void {
  const url = 'postgresql://elo:elo_local@localhost:54340/elo_alertas_teste?schema=public';
  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (erro) {
    const saida = erro instanceof Error && 'stderr' in erro ? String((erro as { stderr: unknown }).stderr) : '';
    throw new Error(`Não consegui preparar o banco de teste. O compose está no ar (npm run db:subir)?\n${saida}`);
  }
}
