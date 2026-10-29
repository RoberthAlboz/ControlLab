/**
 * Seed idempotente de desenvolvimento.
 *
 * Pode ser executada quantas vezes for necessário: cada registro é identificado
 * por uma chave estável (e-mail, id do módulo, código do item, nome da categoria
 * ou `requestKey` da movimentação) e só é criado se ainda não existir. Edições
 * feitas pelo docente depois da primeira seed não são sobrescritas.
 *
 * Os dados são de DEMONSTRAÇÃO (rotulados no README e no selo "DEV" da
 * interface). Senhas vêm do .env — nunca ficam no código.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  classrooms,
  instructors,
  inventoryCategories,
  inventoryItems,
  inventoryLoans,
  learningActivities,
  learningModules,
  learningResources,
  learningSteps,
  users,
} from "../drizzle/schema";
import { CLASS_PERIOD_MS, classSchedule, createPeriodDate, nextSchoolDateKey } from "@shared/class-schedule";
import { hashPassword, MIN_PASSWORD_LENGTH } from "./_core/password";
import { requireDb } from "./db";
import * as inventory from "./inventory";
import type { ItemCreateInput } from "@shared/inventory-schemas";

const modelUrls = {
  box: "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/utility_box_01/utility_box_01_1k.gltf",
  drill: "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/drill_press_01/drill_press_01_1k.gltf",
  wrench: "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/combination_wrench/combination_wrench_1k.gltf",
  chest: "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_tool_chest/metal_tool_chest_1k.gltf",
};

type SeedAccount = { email: string; name: string; password: string; role: "student" | "teacher" | "admin" };
type SeedLog = (message: string) => void;

function readAccount(prefix: "TEACHER" | "STUDENT" | "ADMIN", defaults: { email: string; name: string; role: SeedAccount["role"] }): SeedAccount {
  const email = (process.env[`SEED_${prefix}_EMAIL`] || defaults.email).trim().toLowerCase();
  const name = process.env[`SEED_${prefix}_NAME`] || defaults.name;
  const password = process.env[`SEED_${prefix}_PASSWORD`] || "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Defina SEED_${prefix}_PASSWORD no .env (mínimo de ${MIN_PASSWORD_LENGTH} caracteres) antes de rodar a seed. Veja .env.example.`,
    );
  }
  return { email, name, password, role: defaults.role };
}

async function upsertSeedUser(account: SeedAccount, log: SeedLog) {
  const db = await requireDb();
  const openId = `local:${account.email}`.slice(0, 64);
  const [existing] = await db.select().from(users).where(eq(users.email, account.email)).limit(1);
  const resetPasswords = process.env.SEED_RESET_PASSWORDS === "true";
  if (!existing) {
    await db.insert(users).values({
      openId,
      email: account.email,
      name: account.name,
      role: account.role,
      loginMethod: "password",
      passwordHash: await hashPassword(account.password),
      active: 1,
    });
    log(`conta criada: ${account.email} (${account.role})`);
  } else if (resetPasswords || !existing.passwordHash) {
    await db.update(users).set({ passwordHash: await hashPassword(account.password), role: account.role, active: 1 }).where(eq(users.id, existing.id));
    log(`senha redefinida: ${account.email}`);
  } else if (existing.name !== account.name) {
    // Contas de desenvolvimento acompanham o nome definido no .env (ex.: troca de marca).
    await db.update(users).set({ name: account.name }).where(eq(users.id, existing.id));
    log(`nome atualizado: ${account.email} → ${account.name}`);
  } else {
    log(`conta mantida: ${account.email}`);
  }
  const [user] = await db.select().from(users).where(eq(users.email, account.email)).limit(1);
  return user;
}

async function seedLearning(log: SeedLog) {
  const db = await requireDb();
  await db.insert(learningModules).values([
    { id: "matriz", code: "MÓDULO 03", title: "Matriz de molde", kind: "Montagem", description: "Do material bruto ao conjunto final, com foco em superfícies de contato e precisão.", objective: "Construir e validar uma matriz funcional respeitando as tolerâncias do projeto.", cover: "#f6e7e8", progress: 0, duration: "45 min", published: 1 },
    { id: "torno", code: "MÓDULO 04", title: "Operação de torno", kind: "Ferramenta", description: "Leitura do torno, escolha da ferramenta e sequência de acabamento do componente.", objective: "Reconhecer a máquina e executar o torneamento com segurança e controle dimensional.", cover: "#eee9e2", progress: 0, duration: "35 min", published: 1 },
    { id: "ajuste", code: "MÓDULO 05", title: "Ajuste e acabamento", kind: "Processo", description: "Técnicas de lima, lixa e inspeção para entregar uma peça dentro da tolerância.", objective: "Escolher o acabamento correto e documentar a inspeção final.", cover: "#e9edf4", progress: 0, duration: "25 min", published: 0 },
  ]).onConflictDoNothing();
  await db.insert(learningSteps).values([
    { id: "m1", moduleId: "matriz", position: 0, title: "Material bruto", description: "Confira dimensões, material e faces de referência antes de iniciar a usinagem.", tip: "Meça o bloco em três pontos e registre a maior variação.", quiz: JSON.stringify({"question":"Por que medir o bloco em três pontos antes de usinar?","options":["Para descobrir a maior variação de dimensão do material bruto","Para economizar tempo de máquina","Porque o paquímetro só mede um ponto por vez"],"correctIndex":0,"explanation":"A medição em vários pontos revela a variação do bruto e define quanto material remover."}) },
    { id: "m2", moduleId: "matriz", position: 1, title: "Preparar máquina", description: "Selecione a máquina, fixe o material e confira rotação, avanço e segurança.", tip: "Observe primeiro as superfícies de contato: elas determinam a ordem de usinagem.", quiz: JSON.stringify({"question":"O que deve ser observado primeiro ao preparar a máquina para a matriz?","options":["A cor da peça","As superfícies de contato","O nome do fabricante da máquina"],"correctIndex":1,"explanation":"As superfícies de contato determinam a ordem de usinagem."}) },
    { id: "m3", moduleId: "matriz", position: 2, title: "Lapidar e medir", description: "Use a ferramenta adequada para remover pequenas quantidades e valide a medida após cada passe.", tip: "Faça uma medição intermediária antes do acabamento final.", quiz: JSON.stringify({"question":"Quando fazer uma medição intermediária?","options":["Só depois de montar o conjunto","Antes do acabamento final","Nunca: a medida final basta"],"correctIndex":1,"explanation":"Medir antes do acabamento evita remover material demais."}) },
    { id: "m4", moduleId: "matriz", position: 3, title: "Montar peça", description: "Limpe as superfícies, confira a orientação e monte as mini peças até formar o conjunto.", tip: "O encaixe correto não exige força: confirme o alinhamento antes de pressionar.", quiz: JSON.stringify({"question":"Como saber se o encaixe das mini peças está correto?","options":["Ele exige muita força","Ele entra sem força, com o alinhamento conferido","Basta ouvir um clique"],"correctIndex":1,"explanation":"Encaixe correto não exige força: confirme o alinhamento antes de pressionar."}) },
    { id: "t1", moduleId: "torno", position: 0, title: "Conhecer o torno", description: "Identifique placa, contraponto, carro e pontos de risco antes de ligar a máquina.", tip: "Nunca aproxime a mão de uma peça em rotação.", quiz: JSON.stringify({"question":"Qual regra de segurança vale com o torno ligado?","options":["Aproximar a mão para sentir a vibração","Nunca aproximar a mão de uma peça em rotação","Limpar o cavaco com a mão"],"correctIndex":1,"explanation":"Peça em rotação pode puxar a mão ou a roupa."}) },
    { id: "t2", moduleId: "torno", position: 1, title: "Fixar e centralizar", description: "Prenda a peça corretamente e confirme o alinhamento com o relógio comparador.", tip: "Uma fixação estável reduz vibração e melhora o acabamento.", quiz: JSON.stringify({"question":"Qual instrumento confirma o alinhamento da peça no torno?","options":["Relógio comparador","Trena","Esquadro de madeira"],"correctIndex":0,"explanation":"O relógio comparador mostra o batimento da peça ao girar."}) },
    { id: "t3", moduleId: "torno", position: 2, title: "Executar o passe", description: "Selecione avanço e profundidade adequados ao material e acompanhe a formação do cavaco.", tip: "Faça passes leves até alcançar a medida de acabamento.", quiz: JSON.stringify({"question":"Como alcançar a medida de acabamento com segurança?","options":["Um único passe profundo","Passes leves até a medida","Aumentar ao máximo o avanço"],"correctIndex":1,"explanation":"Passes leves dão controle dimensional e melhor acabamento."}) },
  ]).onConflictDoNothing();
  await db.insert(learningResources).values([
    { id: "material", moduleId: "matriz", category: "materials", label: "Material bruto", title: "Barra de aço SAE 1045", detail: "Bloco base para iniciar o processo", status: "Etapa 01", progress: 100, modelUrl: modelUrls.box, color: "#b21e2b" },
    { id: "machine", moduleId: "matriz", category: "machines", label: "Máquina", title: "Furadeira de bancada", detail: "Furação e preparação das faces", status: "Etapa 02", progress: 72, modelUrl: modelUrls.drill, color: "#333333" },
    { id: "tools", moduleId: "matriz", category: "tools", label: "Ferramenta", title: "Jogo de chaves combinadas", detail: "Aço temperado · fixação do conjunto", status: "Etapa 03", progress: 48, modelUrl: modelUrls.wrench, color: "#777777" },
    { id: "parts", moduleId: "matriz", category: "parts", label: "Mini peças", title: "Pinos-guia Ø 10 mm", detail: "Componentes de alinhamento da montagem", status: "Etapa 04", progress: 26, modelUrl: modelUrls.chest, color: "#b21e2b" },
    { id: "torno-maquina", moduleId: "torno", category: "machines", label: "Máquina", title: "Torno mecânico universal", detail: "Máquina usada em todas as etapas", status: "Etapa 01", progress: 0, modelUrl: "", color: "#333333" },
    { id: "torno-inserto", moduleId: "torno", category: "tools", label: "Ferramenta de corte", title: "Inserto WNMG 060404", detail: "Pastilha para desbaste e acabamento", status: "Etapa 03", progress: 0, modelUrl: "", color: "#777777" },
  ]).onConflictDoNothing();
  const [{ total: instructorCount }] = await db.select({ total: sql<number>`count(*)` }).from(instructors);
  if (Number(instructorCount) === 0) {
    await db.insert(instructors).values([
      { name: "Marina Ribeiro", role: "Usinagem e CNC", badge: "Especialista", initials: "MR" },
      { name: "Carlos Almeida", role: "Montagem de moldes", badge: "Instrutor", initials: "CA" },
      { name: "João Santos", role: "Metrologia aplicada", badge: "Instrutor", initials: "JS" },
    ]);
  }
  const now = new Date();
  const firstClass = createPeriodDate(nextSchoolDateKey(now), classSchedule[4].id);
  const secondClass = createPeriodDate(nextSchoolDateKey(now, 1), classSchedule[2].id);
  await db.insert(learningActivities).values([
    { id: "activity-material", moduleId: "matriz", title: "Material bruto e preparação", subtitle: "Matriz de molde", activityType: "aula", startsAt: firstClass, endsAt: new Date(firstClass.getTime() + CLASS_PERIOD_MS), color: "#fae5e7" },
    { id: "activity-torno", moduleId: "torno", title: "Operação de torno", subtitle: "Laboratório presencial", activityType: "laboratorio", startsAt: secondClass, endsAt: new Date(secondClass.getTime() + CLASS_PERIOD_MS), color: "#fff1bd" },
  ]).onConflictDoNothing();
  log("módulos, etapas, recursos, docentes e agenda verificados");
}

/** Turmas de demonstração com o docente da seed como responsável; o aluno da seed entra na primeira. */
async function seedClassrooms(teacherId: number, studentId: number, log: SeedLog) {
  const db = await requireDb();
  const names = ["2º Ano Mecânica A", "2º Ano Mecânica B"];
  await db.insert(classrooms).values(names.map(name => ({ name, teacherId }))).onConflictDoNothing();
  const [first] = await db.select({ id: classrooms.id }).from(classrooms).where(eq(classrooms.name, names[0])).limit(1);
  if (first) await db.update(users).set({ classroomId: first.id }).where(and(eq(users.id, studentId), isNull(users.classroomId)));
  log("turmas de demonstração verificadas");
}

const SEED_CATEGORIES = [
  { name: "Ferramentas de corte", description: "Brocas, insertos e fresas" },
  { name: "Instrumentos de medição", description: "Paquímetros, micrômetros e relógios comparadores" },
  { name: "Máquinas", description: "Equipamentos fixos da oficina" },
  { name: "Matéria-prima", description: "Barras, blocos e chapas" },
  { name: "Ferramentas manuais", description: "Chaves, limas e martelos" },
  { name: "Componentes de montagem", description: "Pinos, buchas e parafusos" },
];

type SeedItem = Omit<ItemCreateInput, "categoryId" | "requestKey" | "initialReason" | "initialQuantity" | "icon"> & {
  /** Ausente = figura automática. */
  icon?: ItemCreateInput["icon"];
  category: string;
  entrada: number;
  entradaReason: "compra" | "doacao" | "inventario";
};

const SEED_ITEMS: SeedItem[] = [
  { code: "BRC-HSS-008", sapCode: null, name: "Broca helicoidal HSS Ø 8 mm", description: "Broca de aço rápido para furação em aço carbono.", itemType: "tool", category: "Ferramentas de corte", unit: "UN", returnable: true, minQuantity: 5, sector: "Ferramentaria", location: "Armário A · gaveta 1", conservation: "bom", status: "disponivel", entrada: 20, entradaReason: "compra" },
  { code: "INS-WNMG-060404", sapCode: "1004916", name: "Inserto WNMG 060404 - PP IC907", description: "Consumível de torneamento. O código SAP pode se repetir em outras descrições.", itemType: "tool", category: "Ferramentas de corte", unit: "UN", returnable: false, minQuantity: 10, sector: "Mecânica", location: "Mecânica · gaveta de insertos", conservation: "novo", status: "disponivel", entrada: 12, entradaReason: "compra" },
  { code: "PAQ-150", sapCode: null, name: "Paquímetro universal 150 mm", description: "Resolução 0,02 mm.", itemType: "tool", category: "Instrumentos de medição", unit: "UN", returnable: true, minQuantity: 2, sector: "Metrologia", location: "Armário B · prateleira 2", conservation: "bom", status: "disponivel", entrada: 6, entradaReason: "inventario" },
  { code: "MIC-025", sapCode: null, name: "Micrômetro externo 0–25 mm", description: "Aguardando aferição.", itemType: "tool", category: "Instrumentos de medição", unit: "UN", returnable: true, minQuantity: 1, sector: "Metrologia", location: "Armário B · prateleira 1", conservation: "regular", status: "manutencao", entrada: 2, entradaReason: "inventario" },
  { code: "FUR-BANC-01", sapCode: null, name: "Furadeira de bancada", description: "Equipamento fixo da bancada 3.", itemType: "machine", category: "Máquinas", unit: "UN", returnable: false, minQuantity: 0, sector: "Ferramentaria", location: "Oficina · bancada 3", conservation: "bom", status: "disponivel", entrada: 1, entradaReason: "inventario" },
  { code: "TOR-01", sapCode: null, name: "Torno mecânico universal", description: "Equipamento fixo da oficina.", itemType: "machine", category: "Máquinas", unit: "UN", returnable: false, minQuantity: 0, sector: "Mecânica", location: "Oficina · posição 1", conservation: "bom", status: "disponivel", entrada: 1, entradaReason: "inventario" },
  { code: "ACO-1045-50", sapCode: null, name: "Barra de aço SAE 1045 Ø 50 × 100 mm", description: "Peças cortadas para os exercícios de usinagem.", itemType: "material", category: "Matéria-prima", unit: "PC", returnable: false, minQuantity: 5, sector: "Almoxarifado", location: "Almoxarifado · estante M1", conservation: "novo", status: "disponivel", entrada: 15, entradaReason: "compra" },
  { code: "CHV-COMB-JG", sapCode: null, name: "Jogo de chaves combinadas 8–19 mm", description: "Jogo com 12 peças.", itemType: "tool", category: "Ferramentas manuais", unit: "JG", returnable: true, minQuantity: 1, sector: "Ferramentaria", location: "Armário A · gaveta 4", conservation: "bom", status: "disponivel", entrada: 3, entradaReason: "doacao" },
  { code: "PIN-GUIA-10", sapCode: null, name: "Pino-guia Ø 10 mm", description: "Mini peça para montagem de matrizes.", itemType: "part", category: "Componentes de montagem", unit: "UN", returnable: false, minQuantity: 20, sector: "Ferramentaria", location: "Gaveteiro C · divisória 2", conservation: "novo", status: "disponivel", entrada: 50, entradaReason: "compra" },
];

const RESOURCE_LINKS: Array<{ resourceId: string; code: string }> = [
  { resourceId: "material", code: "ACO-1045-50" },
  { resourceId: "machine", code: "FUR-BANC-01" },
  { resourceId: "tools", code: "CHV-COMB-JG" },
  { resourceId: "parts", code: "PIN-GUIA-10" },
  { resourceId: "torno-maquina", code: "TOR-01" },
  { resourceId: "torno-inserto", code: "INS-WNMG-060404" },
];

async function seedInventory(teacherId: number, student: { id: number; name: string | null }, log: SeedLog) {
  const db = await requireDb();
  await db.insert(inventoryCategories).values(SEED_CATEGORIES.map(category => ({ ...category, createdBy: teacherId }))).onConflictDoNothing();
  const categories = await db.select().from(inventoryCategories).where(inArray(inventoryCategories.name, SEED_CATEGORIES.map(category => category.name)));
  const categoryId = new Map<string, number>(categories.map(category => [category.name, category.id] as const));

  for (const seed of SEED_ITEMS) {
    const [existing] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.code, seed.code)).limit(1);
    if (existing) continue;
    const { category, entrada, entradaReason, ...fields } = seed;
    await inventory.createItem(
      {
        ...fields,
        icon: fields.icon ?? null,
        categoryId: categoryId.get(category) ?? null,
        initialQuantity: entrada,
        initialReason: entradaReason,
        requestKey: `seed-entrada-${seed.code}`,
      },
      teacherId,
    );
    log(`item criado: ${seed.code}`);
  }

  const itemIds = new Map<string, number>(
    (await db.select({ id: inventoryItems.id, code: inventoryItems.code }).from(inventoryItems).where(inArray(inventoryItems.code, SEED_ITEMS.map(item => item.code)))).map(item => [item.code, item.id] as const),
  );

  // Saída para aula (cenário de estoque baixo: 12 − 4 = 8 ≤ mínimo 10).
  const insertId = itemIds.get("INS-WNMG-060404");
  if (insertId) {
    await inventory.registerMovement(
      { itemId: insertId, type: "saida", quantity: 4, reason: "aula", reference: "Aula de torneamento", note: null, moduleId: "torno", requestKey: "seed-saida-inserto-aula" },
      teacherId,
    );
  }
  // Saída de matéria-prima para a aula da matriz.
  const steelId = itemIds.get("ACO-1045-50");
  if (steelId) {
    await inventory.registerMovement(
      { itemId: steelId, type: "saida", quantity: 3, reason: "aula", reference: "Exercício de faceamento", note: null, moduleId: "matriz", requestKey: "seed-saida-aco-aula" },
      teacherId,
    );
  }
  // Empréstimo: paquímetro reservado e retirado pelo aluno de demonstração.
  const caliperId = itemIds.get("PAQ-150");
  if (caliperId) {
    const { loanId } = await inventory.createLoan(
      {
        itemId: caliperId,
        quantity: 1,
        borrowerUserId: student.id,
        borrowerName: student.name ?? "Aluno",
        purpose: "Medição das peças do módulo Matriz de molde",
        moduleId: "matriz",
        dueAt: null,
        requestKey: "seed-emprestimo-paquimetro",
      },
      teacherId,
    );
    const [loan] = await db.select({ status: inventoryLoans.status }).from(inventoryLoans).where(eq(inventoryLoans.id, loanId)).limit(1);
    if (loan?.status === "reservado") await inventory.deliverLoan(loanId, teacherId);
  }
  // Reserva ainda não retirada: broca para a próxima aula.
  const drillBitId = itemIds.get("BRC-HSS-008");
  if (drillBitId) {
    await inventory.createLoan(
      {
        itemId: drillBitId,
        quantity: 2,
        borrowerUserId: null,
        borrowerName: "Turma de Ferramentaria — Bancada 3",
        purpose: "Furação dos blocos na próxima aula",
        moduleId: "matriz",
        dueAt: null,
        requestKey: "seed-reserva-broca",
      },
      teacherId,
    );
  }

  for (const link of RESOURCE_LINKS) {
    const itemId = itemIds.get(link.code);
    if (!itemId) continue;
    await db
      .update(learningResources)
      .set({ inventoryItemId: itemId })
      .where(and(eq(learningResources.id, link.resourceId), isNull(learningResources.inventoryItemId)));
  }
  log("estoque verificado: categorias, itens, entradas, saídas, empréstimos e vínculos com módulos");
}

export async function runSeed(log: SeedLog = message => console.log(`[seed] ${message}`)) {
  const teacher = await upsertSeedUser(readAccount("TEACHER", { email: "docente@forgelab.local", name: "Docente Control Lab", role: "teacher" }), log);
  const student = await upsertSeedUser(readAccount("STUDENT", { email: "aluno@forgelab.local", name: "Aluno Control Lab", role: "student" }), log);
  if (!teacher || !student) throw new Error("Não foi possível criar as contas de desenvolvimento.");
  // Administração é opcional para não quebrar .env antigos que ainda não têm SEED_ADMIN_*.
  if (process.env.SEED_ADMIN_PASSWORD) {
    await upsertSeedUser(readAccount("ADMIN", { email: "admin@forgelab.local", name: "Administração Control Lab", role: "admin" }), log);
  } else {
    log("conta de administração ignorada: defina SEED_ADMIN_PASSWORD no .env para criá-la");
  }
  await seedLearning(log);
  await seedClassrooms(teacher.id, student.id, log);
  await seedInventory(teacher.id, student, log);
}
