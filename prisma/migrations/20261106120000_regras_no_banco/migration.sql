-- Regras que valem mesmo se alguém gravar direto no banco, sem passar pela API.
-- O Prisma não descreve CHECK no schema; por isso esta migração é escrita à mão.

ALTER TABLE "reguas"
  ADD CONSTRAINT "reguas_limite_positivo" CHECK ("limite_metros" > 0 AND "limite_metros" <= 20);

ALTER TABLE "leituras"
  ADD CONSTRAINT "leituras_nivel_valido" CHECK ("nivel_metros" >= 0 AND "nivel_metros" <= 20),
  ADD CONSTRAINT "leituras_bateria_valida" CHECK ("bateria_percentual" IS NULL OR ("bateria_percentual" BETWEEN 0 AND 100));

ALTER TABLE "avisos"
  ADD CONSTRAINT "avisos_periodo_valido" CHECK ("fim" >= "inicio");

-- A "última leitura" é a última que chegou (o relógio do ESP32 pode estar errado).
CREATE INDEX "leituras_regua_id_recebida_em_idx" ON "leituras" ("regua_id", "recebida_em" DESC);
