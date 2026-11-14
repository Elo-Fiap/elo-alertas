-- AlterTable
ALTER TABLE "reguas" ADD COLUMN     "atencao_metros" DECIMAL(5,2),
ADD COLUMN     "codigo_ibge" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "rua_id" TEXT;

-- Regras que o Prisma não descreve: coordenada sempre em par e dentro do mapa,
-- município com 7 dígitos e atenção positiva e abaixo do limite.
ALTER TABLE "reguas"
  ADD CONSTRAINT "reguas_coordenada_em_par" CHECK (
    ("latitude" IS NULL AND "longitude" IS NULL)
    OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL
        AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
  ),
  ADD CONSTRAINT "reguas_codigo_ibge_valido" CHECK ("codigo_ibge" IS NULL OR "codigo_ibge" ~ '^[0-9]{7}$'),
  ADD CONSTRAINT "reguas_atencao_abaixo_do_limite" CHECK (
    "atencao_metros" IS NULL OR ("atencao_metros" > 0 AND "atencao_metros" < "limite_metros")
  );
