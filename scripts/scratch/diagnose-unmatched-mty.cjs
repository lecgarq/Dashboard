#!/usr/bin/env node
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const rawInput = `
2026 DP
00 D Artha Escobedo (Dewa)
00 D Proyecto Scrum
00 D Terra Park Salinas
00 D Yazaki Ampliación Cables 1
02 D MEXLOG Cienega de Flores
03 D Davisa 03 Oficinas M-3 CHO
04 D Park life & Bussines center Prologis
06 D Vesta - Pluvial y Canopy
07 D Refuerzo estructural Yazaki
08 D PPSP TI's Amazon
11 D Bulkmatic
12 D TI's Lydech Vesta 02
13 D Estructura Lunaris
13 D Parque industrial Escobedo
14 D Cedis Soriana Chihuahua Terracerías
15 D Contitech expansion
16 D Vesta Turin terracerias
17 D Lego
18 D Bulkmatic Pesqueria silos
19 D Uline E6 Mexicali
20 D Ampliacion Papelera San Francisco
21 D Preco Leoni Durango
22 D Nomada Fibra Mty
23 D Adecuaciones Dawn Sta Catarina
24 D Vesta BJX-04
25 D Renovacion Edif Viakable Mty
26 D Mabe

2025 DO
00 D Oficinas MTY
01 D Prepa Tec Hermosillo Precon
02 D Oficinas Prologis PPAE1
03 D GK Building Silao
04 D D-TROY
05 D Nave inventario Delta
06 D APTIV Oficinas
08 D GMX Silao Engine - GRX
09 D TLE Zona Administrativa
10 D Infraestructura PIP Aeropuerto
12 D EAM Mosca
13 D Torre Guadalajara
14 D Torre Banorte GDL
16 D Caterpillar Acuña
18 D Caterpillar Sta Catarina
19 D Vertex Pesqueria
20 D El Nucleo - Tecnologico de Monterrey
21 D Areya TI's AGIIP-002-2025
22 D Oficinas Schneider PIA1
23 D TI's Walmart Mty
24 D VPSN Demoliciones - terracerias
25 D TI's Vesta Apodaca 06
26 D Ampliacion Cat Nvo Laredo
27 D Continental Expansion SLP
28 D Prepa ITESM Hermosillo
29 D Flex N Gate Hermosillo
30 D Ampliacion Milwaukee Torreon
32 D TI's Vesta Apodaca 07
33 D Ampliacion Inteva PI
35 D Vesta San Nicolas INFRA
35.1 D Vesta San Nicolas ED.01
35.2 D Vesta San Nicolas ED.02
36 D Clean Room Reynosa
37 D Home Depot Juarez
38 D Preliminares PAMA Caterpillar Acuña
39 D Oficinas Vesta 08
40 D ProximityParks Monterrey Centro II
41 D Ampliacion SIG
42 D Canopy Vesta Apodaca
43 D Prologis Park Life
44 D Boost Project
46 D Landis + Gyr Reynosa
47 Vesta Nomada
48 D Siemens Energy Mty
49 D Centro recreativo Caterpillar Acuña
50 D Arc South GM expansion
51 D Prosperity Hermosillo Inventario

2024 DN
00 D Oficinas MTY
01 D Prosperity Spec07
02 D Continental
03 D Prologis PPAE 9
04 D Danfoss Fase 02 - SEN - Utilities
05 D Danfoss Fase 03 - GDS - Utilities
06 D Prologis PPAEE1 DSV
08 D FNG Metales Coahuila
09 Caterpillar - Club Familiar
10 D CNH Industrial phase I
11 D Genesis BTS
12 D Davisa Multitenant 22
13 D Davisa Multitenant 03
14 D Vesta Apodaca VMPA 08
15 D Flex N Gate Derramadero
16 D Uline - Prologis Toluca
19 D Ampliación Caterpillar HUB Fibra Mty
20 D ARZYZ Boulevard
21 D Biblioteca UDEM
22 D Prologis PPAE12
23 D Ampliacion Vialidad Prologis
24 D Unilever

2023 DM
01 D Prologis BTS Guanajuato
02 D Ampliación Flex-N-Gate Plásticos
03 D Innovación Tec MTY
04 D Prologis Ripple
05 D Unilever
06 D Prologis Agua Fria 7
07 D Ampliación Flex-N-Gate Hermosillo
08 D Ampliacion Parker-Hannifin-Stiva
09 D Polaris Powertrain
10 D Cedis GSI-DSI
11 D Cedis Autozone Monterrey
12 D Advance Nave Inventario
13 D Ampliación Danfoss
16 D Ampliacion KIA
19 D Infra Parque Industrial Progreso Hermosillo
20 D Vesta Cd Juarez 05
21 D Prologis PPAE8
23 D Zilum Park Edificio SPEC-01
25 D Ampliacion Magna Queretaro
26 D Torres Litica
27 D Prosperity Reynosa
28 D BMW Baterias
29.1 D VPMA05
29.2 D VPMA07
30 Caterpillar Nuevo Laredo
31 Prologis PPAE4
33 Prologis Pepsico
34 Terex Fase II
35 BMW GEN 6 Baterias
36 Vesta 06
37 Vesta 08
39 BMW NCAR TKB Expansion SLP
40 Prologis PPAE1 DSV
41 Caterpillar Azteca
43 D Atlas Project

2022 DL
01 D Daikin II
02 D Avante AP03
03 D THD Concordia
04 D Multivin
05 D PIAM - BTS Carvajal
07 D Infraestructura Prologis Apodaca East
08 D Exeter 1 Qro
09 D Prologis BTS Meli
10 D VPMA02
12 D ResTec Puebla
13 D Avante A09B
16 D Ampliacion Flex N Gate Hermosillo 3
19 D Ampliacion Cedis Autozone
21 D ITESM QRO
24 D Regal Rexnord
26 D Emerson Mexico Plant 2
27 D THD Hermosillo
28 D Avante CMCO
29 D Proximity Parks
30 D Proximity Parks San Pedro
31 D BTS San Miguel
32 D Daikin SLP - RAQA and Plant II
33 D Ezi Metales
34 D FNG Ampliación Plásticos
35 D VPMA03
35.1 D VPMA04
36 D Siemens
37 D Ampliación Flex-N-Gate Metales IV
38 D Ampliación Avante AP03
39 D MER Owens Corning
40 D Terex Fase II
41 D Franke
42 D Inventario Prosperity NL
43 D Franke Edificio
44 D Tredec Nave Inventario

2021 DK
01 D Loncin Hofusan
02 D Daikin SLP
03 D Vesta Roma Apodaca
04 D Flex-N-Gate Metales IV
05 D Cedis Caterpillar Santa Catarina
07 D Residencias Tec Monterrey
10 D Prologis Zebra Pen Ampliacion
11 D Avante PIAA-06
12 D Continental Silao
13 D Vesta La Loma
14 D Ampliacion Daikin SLP
15 D Avante AP02
16 D THD Gonzalitos Tienda
16.1 D Prologis Uline PPA6
16.2 D Prologis PPA8
17 D Advance Edificio 02
18 D HUBS Park Apodaca 1
21 D THD Cancún
22 D Avante AP06 FAS
24 D Prologis Villa Florida II Building 2
25 D Vesta VPMG-02
26 D Prologis Toro
27 D Terex Mty
31 D Proximity Parks
32 D Kohler SFO
33 D Avante A06 Amazon
34 D Prologis Agua Fría
35 D Ventum

2020 DJ
01 BS Prologis
01 D Home Depot Corregidora
01 D Liverpool Mitikah
02 D Expansion Zebra PPA 11
04 D Ampliación Flex-N-Gate Hermosillo
07 D Cedis Mercado Libre - Advance
08 D Skyish Warehouse
09 D Vesta MTY-VGGT01
13 D Prologis PPA7 AFL
14 D Avante AFL
15 D Infraestructura Prologis 2 Mty
18 D Fawer TI
21 D Kohler Mold Shop Building
22 D IGS Nave Inventario
24 D Hofusan Spec3
26 D Residencias Tec Querétaro
27 D Avante AP06
29 D Prologis PPA3 Thermosfisher
31 D Prologis Multiniveles
33 D Hofusan Extensión Av. Puerto Grande
35 D Continental Silao
38 D Avante A-06
42 D Plataformas Advance Garcia
43 D PIAQ-SPEC G Advance
44 D Continental Edificio 2 Phase A
45 D T-REX BTS Advance Monterrey
47 D THD Chihuahua
`;

function cleanName(line) {
  let cleaned = line.trim();
  if (!cleaned || /^\d{4}\s+D[NMODLKPJ]$/i.test(cleaned)) return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?\s+D\s+)(.*)$/i) || cleaned.match(/^(\d+\s+)(.*)$/i) || cleaned.match(/^(\d+BS\s+)(.*)$/i);
  if (match) cleaned = match[2].trim();
  return cleaned;
}

function normalizeStr(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const lines = rawInput.split("\n");
    const targets = [];
    for (const l of lines) {
      const cleaned = cleanName(l);
      if (cleaned) targets.push({ raw: l, clean: cleaned, norm: normalizeStr(cleaned) });
    }

    const dbProjects = await prisma.accProject.findMany({
      select: { id: true, name: true }
    });

    console.log(`Diagnosing first 15 unmatched projects:\n`);
    let count = 0;
    for (const target of targets) {
      // Check if it matches via simple token search
      const tokens = target.norm.split(" ").filter(t => t.length > 2);
      const matches = dbProjects.filter(p => {
        const pNorm = normalizeStr(p.name);
        return tokens.every(token => pNorm.includes(token));
      });

      if (matches.length === 0) {
        count++;
        if (count > 15) continue;
        console.log(`Target: "${target.clean}"`);
        // Find DB projects that match AT LEAST ONE token
        const partialMatches = dbProjects.filter(p => {
          const pNorm = normalizeStr(p.name);
          return tokens.some(token => pNorm.includes(token));
        }).slice(0, 5);
        console.log(`  Tokens: [${tokens.join(", ")}]`);
        console.log(`  Similar in DB:`);
        if (partialMatches.length === 0) {
          console.log(`    • (No projects in DB sharing any tokens)`);
        } else {
          partialMatches.forEach(p => {
            console.log(`    • "${p.name}" (${p.id})`);
          });
        }
        console.log("-----------------------------------------");
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
