-- CreateEnum
CREATE TYPE "severidade" AS ENUM ('PERIGO_POTENCIAL', 'PERIGO', 'GRANDE_PERIGO');

-- CreateTable
CREATE TABLE "avisos" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "severidade" "severidade" NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "riscos" TEXT[],
    "instrucoes" TEXT[],
    "municipios" TEXT[],
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sincronizacoes" (
    "id" SERIAL NOT NULL,
    "fonte" TEXT NOT NULL,
    "feita_em" TIMESTAMPTZ(3) NOT NULL,
    "sucesso" BOOLEAN NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "erro" TEXT,

    CONSTRAINT "sincronizacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avisos_municipios_idx" ON "avisos" USING GIN ("municipios");
