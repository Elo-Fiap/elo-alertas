-- CreateTable
CREATE TABLE "reguas" (
    "id" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "limite_metros" DECIMAL(5,2) NOT NULL,
    "altura_sensor_metros" DECIMAL(5,2),
    "chave_hash" TEXT NOT NULL,
    "criada_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reguas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leituras" (
    "id" BIGSERIAL NOT NULL,
    "regua_id" TEXT NOT NULL,
    "nivel_metros" DECIMAL(5,2) NOT NULL,
    "medida_em" TIMESTAMPTZ(3) NOT NULL,
    "recebida_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bateria_percentual" INTEGER,

    CONSTRAINT "leituras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leituras_regua_id_medida_em_idx" ON "leituras"("regua_id", "medida_em" DESC);

-- AddForeignKey
ALTER TABLE "leituras" ADD CONSTRAINT "leituras_regua_id_fkey" FOREIGN KEY ("regua_id") REFERENCES "reguas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
