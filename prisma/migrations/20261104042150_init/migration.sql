-- CreateEnum
CREATE TYPE "EstadoFarmacia" AS ENUM ('listada', 'activa', 'integrada');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('esperando_seleccion', 'esperando_confirmacion', 'consultando', 'resuelta', 'sin_resultados');

-- CreateEnum
CREATE TYPE "RespuestaFarmacia" AS ENUM ('si_tengo', 'no_tengo', 'sin_respuesta');

-- CreateTable
CREATE TABLE "Pharmacy" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "estado" "EstadoFarmacia" NOT NULL,

    CONSTRAINT "Pharmacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicineSegment" (
    "id" TEXT NOT NULL,
    "principioActivo" TEXT NOT NULL,
    "concentracion" TEXT NOT NULL,
    "forma" TEXT NOT NULL,
    "nombresComerciales" TEXT[],
    "coloquiales" TEXT[],

    CONSTRAINT "MedicineSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRequest" (
    "id" TEXT NOT NULL,
    "telefonoPaciente" TEXT NOT NULL,
    "segmentoId" TEXT,
    "textoDetectado" TEXT,
    "opciones" JSONB,
    "estado" "EstadoSolicitud" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaEn" TIMESTAMP(3),

    CONSTRAINT "SearchRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyQuery" (
    "id" TEXT NOT NULL,
    "solicitudId" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "respuesta" "RespuestaFarmacia" NOT NULL DEFAULT 'sin_respuesta',
    "precio" DOUBLE PRECISION,
    "distanciaTexto" TEXT,
    "distanciaMetros" INTEGER,
    "abierta" BOOLEAN NOT NULL DEFAULT true,
    "enviadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondidaEn" TIMESTAMP(3),

    CONSTRAINT "PharmacyQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" SERIAL NOT NULL,
    "a" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "cuerpo" JSONB NOT NULL,
    "dryRun" BOOLEAN NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pharmacy_telefono_key" ON "Pharmacy"("telefono");

-- CreateIndex
CREATE INDEX "SearchRequest_telefonoPaciente_creadaEn_idx" ON "SearchRequest"("telefonoPaciente", "creadaEn");

-- CreateIndex
CREATE INDEX "SearchRequest_segmentoId_creadaEn_idx" ON "SearchRequest"("segmentoId", "creadaEn");

-- CreateIndex
CREATE INDEX "PharmacyQuery_farmaciaId_enviadaEn_idx" ON "PharmacyQuery"("farmaciaId", "enviadaEn");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyQuery_solicitudId_farmaciaId_key" ON "PharmacyQuery"("solicitudId", "farmaciaId");

-- CreateIndex
CREATE INDEX "OutboundMessage_a_id_idx" ON "OutboundMessage"("a", "id");

-- AddForeignKey
ALTER TABLE "SearchRequest" ADD CONSTRAINT "SearchRequest_segmentoId_fkey" FOREIGN KEY ("segmentoId") REFERENCES "MedicineSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyQuery" ADD CONSTRAINT "PharmacyQuery_solicitudId_fkey" FOREIGN KEY ("solicitudId") REFERENCES "SearchRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyQuery" ADD CONSTRAINT "PharmacyQuery_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "Pharmacy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
