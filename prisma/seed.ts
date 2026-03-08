import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

// Stable UUID for the demo tenant — keeps E2E test credentials consistent across db:reset
const DEMO_TENANT_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSIONS: { module: string; action: string; description: string }[] = [
  // Tenants
  { module: 'tenants', action: 'create', description: 'Create tenants' },
  { module: 'tenants', action: 'read', description: 'View tenants' },
  { module: 'tenants', action: 'update', description: 'Update tenants' },
  { module: 'tenants', action: 'delete', description: 'Delete tenants' },
  // Branches
  { module: 'branches', action: 'create', description: 'Create branches' },
  { module: 'branches', action: 'read', description: 'View branches' },
  { module: 'branches', action: 'update', description: 'Update branches' },
  { module: 'branches', action: 'delete', description: 'Delete branches' },
  // Users
  { module: 'users', action: 'create', description: 'Create users' },
  { module: 'users', action: 'read', description: 'View users' },
  { module: 'users', action: 'update', description: 'Update users' },
  { module: 'users', action: 'delete', description: 'Delete users' },
  // Roles
  { module: 'roles', action: 'create', description: 'Create roles' },
  { module: 'roles', action: 'read', description: 'View roles' },
  { module: 'roles', action: 'update', description: 'Update roles' },
  { module: 'roles', action: 'delete', description: 'Delete roles' },
  // Clients
  { module: 'clients', action: 'create', description: 'Create clients' },
  { module: 'clients', action: 'read', description: 'View clients' },
  { module: 'clients', action: 'update', description: 'Update clients' },
  { module: 'clients', action: 'delete', description: 'Delete clients' },
  // Vehicles
  { module: 'vehicles', action: 'create', description: 'Create vehicles' },
  { module: 'vehicles', action: 'read', description: 'View vehicles' },
  { module: 'vehicles', action: 'update', description: 'Update vehicles' },
  { module: 'vehicles', action: 'delete', description: 'Delete vehicles' },
  // Services
  { module: 'services', action: 'create', description: 'Create services' },
  { module: 'services', action: 'read', description: 'View services' },
  { module: 'services', action: 'update', description: 'Update services' },
  { module: 'services', action: 'delete', description: 'Delete services' },
  // Work Posts
  {
    module: 'work-posts',
    action: 'create',
    description: 'Create work posts',
  },
  { module: 'work-posts', action: 'read', description: 'View work posts' },
  {
    module: 'work-posts',
    action: 'update',
    description: 'Update work posts',
  },
  {
    module: 'work-posts',
    action: 'delete',
    description: 'Delete work posts',
  },
  // Orders
  { module: 'orders', action: 'create', description: 'Create orders' },
  { module: 'orders', action: 'read', description: 'View orders' },
  { module: 'orders', action: 'update', description: 'Update orders' },
  { module: 'orders', action: 'delete', description: 'Delete orders' },
  // Scheduling
  {
    module: 'scheduling',
    action: 'read',
    description: 'View scheduling and availability',
  },
  // Payments
  { module: 'payments', action: 'create', description: 'Create payments' },
  { module: 'payments', action: 'read', description: 'View payments' },
  { module: 'payments', action: 'update', description: 'Update payments' },
  { module: 'payments', action: 'delete', description: 'Delete payments' },
  // Analytics
  { module: 'analytics', action: 'view', description: 'View analytics' },
  // Audit
  { module: 'audit', action: 'read', description: 'View audit logs' },
  // Workforce
  {
    module: 'workforce',
    action: 'create',
    description: 'Create employee profiles and shifts',
  },
  {
    module: 'workforce',
    action: 'read',
    description: 'View employee profiles and shifts',
  },
  {
    module: 'workforce',
    action: 'update',
    description: 'Update employee profiles and shifts',
  },
  {
    module: 'workforce',
    action: 'delete',
    description: 'Delete employee profiles and shifts',
  },
];

// ---------------------------------------------------------------------------
// Data constants for realistic seeding
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Олександр',
  'Марія',
  'Дмитро',
  'Анна',
  'Андрій',
  'Ольга',
  'Сергій',
  'Наталія',
  'Віктор',
  'Тетяна',
  'Михайло',
  'Ірина',
  'Юрій',
  'Катерина',
  'Роман',
  'Оксана',
  'Ігор',
  'Людмила',
  'Василь',
  'Галина',
  'Петро',
  'Вікторія',
  'Олег',
  'Жанна',
  'Богдан',
  'Дарина',
  'Артем',
  'Софія',
  'Максим',
  'Яна',
];

const LAST_NAMES = [
  'Шевченко',
  'Бондаренко',
  'Ткаченко',
  'Коваленко',
  'Мельник',
  'Кравченко',
  'Олійник',
  'Поліщук',
  'Савченко',
  'Лисенко',
  'Марченко',
  'Петренко',
  'Дмитренко',
  'Руденко',
  'Гончаренко',
  'Павленко',
  'Семенко',
  'Іващенко',
  'Тищенко',
  'Козаченко',
];

const CAR_DATA: { make: string; models: string[] }[] = [
  {
    make: 'Toyota',
    models: ['Camry', 'Corolla', 'RAV4', 'Land Cruiser', 'Prius'],
  },
  { make: 'Volkswagen', models: ['Golf', 'Passat', 'Tiguan', 'Polo', 'Jetta'] },
  { make: 'BMW', models: ['3 Series', '5 Series', 'X3', 'X5', '1 Series'] },
  {
    make: 'Mercedes',
    models: ['C-Class', 'E-Class', 'GLC', 'A-Class', 'S-Class'],
  },
  {
    make: 'Hyundai',
    models: ['Tucson', 'Elantra', 'Santa Fe', 'i30', 'Accent'],
  },
  { make: 'Kia', models: ['Sportage', 'Ceed', 'Sorento', 'Rio', 'Optima'] },
  { make: 'Nissan', models: ['Qashqai', 'X-Trail', 'Leaf', 'Juke', 'Sentra'] },
  { make: 'Honda', models: ['Civic', 'CR-V', 'Accord', 'HR-V', 'Jazz'] },
  { make: 'Skoda', models: ['Octavia', 'Superb', 'Kodiaq', 'Fabia', 'Karoq'] },
  { make: 'Renault', models: ['Duster', 'Megane', 'Clio', 'Kadjar', 'Captur'] },
];

const COLORS = [
  'Чорний',
  'Білий',
  'Сірий',
  'Синій',
  'Червоний',
  'Зелений',
  'Сріблястий',
  'Бежевий',
];

const CANCELLATION_REASONS = [
  'Клієнт скасував запис',
  'Клієнт не зміг приїхати',
  'Зміна планів клієнта',
  'Погані погодні умови',
  'Технічні проблеми з обладнанням',
  'Клієнт перенесе на інший день',
  'Автомобіль на СТО',
  'Клієнт знайшов іншу мийку',
];

const SEASONAL_WEIGHTS = [
  0.6, 0.55, 0.7, 0.85, 1.1, 1.3, 1.5, 1.4, 1.2, 0.9, 0.7, 0.55,
];
const BASE_ORDERS_PER_BRANCH = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function generatePhone(): string {
  const codes = [
    '50',
    '66',
    '67',
    '68',
    '73',
    '93',
    '95',
    '96',
    '97',
    '98',
    '99',
  ];
  return `+380${pick(codes)}${String(randInt(1000000, 9999999))}`;
}

function generateLicensePlate(): string {
  const regions = [
    'AA',
    'AB',
    'AC',
    'AE',
    'AH',
    'AI',
    'AK',
    'AM',
    'AO',
    'AP',
    'AT',
    'AX',
    'BA',
    'BB',
    'BC',
    'BE',
    'BH',
    'BI',
    'BK',
    'BM',
    'BO',
    'BT',
    'BX',
    'CA',
    'CB',
    'CE',
    'CH',
    'KA',
    'KB',
    'KC',
    'KE',
    'KH',
    'KI',
    'KK',
  ];
  const letters = 'ABCEHIKMOPTX';
  const region = pick(regions);
  const num = String(randInt(1000, 9999));
  const suffix =
    letters[randInt(0, letters.length - 1)] +
    letters[randInt(0, letters.length - 1)];
  return `${region}${num}${suffix}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function setTime(date: Date, hours: number, minutes: number): Date {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function insertInChunks(
  model: any,
  data: any[],
  chunkSize: number = 500,
): Promise<void> {
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await model.createMany({ data: chunk as any });
  }
}

// ---------------------------------------------------------------------------
// seedRealisticData
// ---------------------------------------------------------------------------

async function seedRealisticData(tenantId: string, adminUserId: string) {
  // Idempotency check: if branches already exist, skip
  const existingBranches = await prisma.branch.findMany({
    where: { tenantId },
  });
  if (existingBranches.length > 0) {
    console.log('Realistic data already seeded (branches exist). Skipping.');
    return;
  }

  console.log('\n--- Seeding realistic data ---');
  const now = new Date();

  // =========================================================================
  // 1. BookingSettings (tenant-level default)
  // =========================================================================
  const existingTenantSettings = await prisma.bookingSettings.findFirst({
    where: { tenantId, branchId: null },
  });
  if (!existingTenantSettings) {
    await prisma.bookingSettings.create({
      data: {
        tenantId,
        slotDurationMinutes: 15,
        bufferTimeMinutes: 10,
        maxAdvanceBookingDays: 30,
        allowOnlineBooking: true,
        workingHoursStart: '08:00',
        workingHoursEnd: '20:00',
        workingDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
      },
    });
  }
  console.log('Tenant-level BookingSettings created');

  // =========================================================================
  // 2. Branches
  // =========================================================================
  const branchDefs = [
    {
      name: 'Центральний філіал',
      address: 'вул. Хрещатик, 22, Київ',
      phone: '+380441234567',
      postCount: 4,
    },
    {
      name: 'Лівобережний філіал',
      address: 'пр. Бажана, 10, Київ',
      phone: '+380442345678',
      postCount: 3,
    },
    {
      name: 'Подільський філіал',
      address: 'вул. Межигірська, 5, Київ',
      phone: '+380443456789',
      postCount: 4,
    },
  ];

  const branches: { id: string; name: string; postCount: number }[] = [];
  for (const bd of branchDefs) {
    const branch = await prisma.branch.create({
      data: {
        tenantId,
        name: bd.name,
        address: bd.address,
        phone: bd.phone,
        isActive: true,
      },
    });
    branches.push({
      id: branch.id,
      name: branch.name,
      postCount: bd.postCount,
    });
  }
  console.log(`Created ${branches.length} branches`);

  // Per-branch BookingSettings (different schedules per branch)
  const branchSchedules = [
    {
      workingHoursStart: '07:00',
      workingHoursEnd: '21:00',
      slotDurationMinutes: 15,
    }, // Центральний — early open, late close
    {
      workingHoursStart: '08:00',
      workingHoursEnd: '20:00',
      slotDurationMinutes: 15,
    }, // Лівобережний — standard
    {
      workingHoursStart: '09:00',
      workingHoursEnd: '19:00',
      slotDurationMinutes: 20,
    }, // Подільський — shorter hours, longer slots
  ];
  for (let i = 0; i < branches.length; i++) {
    await prisma.bookingSettings.upsert({
      where: {
        tenantId_branchId: { tenantId, branchId: branches[i].id },
      },
      update: {},
      create: {
        tenantId,
        branchId: branches[i].id,
        slotDurationMinutes: branchSchedules[i].slotDurationMinutes,
        bufferTimeMinutes: 10,
        maxAdvanceBookingDays: 30,
        allowOnlineBooking: true,
        workingHoursStart: branchSchedules[i].workingHoursStart,
        workingHoursEnd: branchSchedules[i].workingHoursEnd,
        workingDays: [1, 2, 3, 4, 5, 6],
      },
    });
  }
  console.log(`Created ${branches.length} branch-level BookingSettings`);

  // =========================================================================
  // 3. WorkPosts
  // =========================================================================
  const workPosts: { id: string; branchId: string }[] = [];
  for (const branch of branches) {
    for (let i = 1; i <= branch.postCount; i++) {
      const wp = await prisma.workPost.create({
        data: {
          tenantId,
          branchId: branch.id,
          name: `Пост ${i}`,
          isActive: true,
        },
      });
      workPosts.push({ id: wp.id, branchId: branch.id });
    }
  }
  console.log(`Created ${workPosts.length} work posts`);

  // =========================================================================
  // 4. Services
  // =========================================================================
  const serviceDefs = [
    {
      name: 'Експрес мийка',
      description: 'Швидка зовнішня мийка автомобіля',
      durationMin: 15,
      price: 250,
      sortOrder: 1,
    },
    {
      name: 'Базова мийка',
      description: 'Зовнішня мийка з протиранням',
      durationMin: 30,
      price: 400,
      sortOrder: 2,
    },
    {
      name: 'Преміум мийка',
      description: 'Повна мийка з обробкою воском',
      durationMin: 45,
      price: 700,
      sortOrder: 3,
    },
    {
      name: 'Детейлінг',
      description: 'Повний комплекс по догляду за автомобілем',
      durationMin: 90,
      price: 2000,
      sortOrder: 4,
    },
    {
      name: 'Хімчистка салону',
      description: "Глибока хімчистка інтер'єру",
      durationMin: 60,
      price: 1500,
      sortOrder: 5,
    },
    {
      name: 'Полірування',
      description: 'Полірування кузова автомобіля',
      durationMin: 60,
      price: 1200,
      sortOrder: 6,
    },
    {
      name: 'Мийка двигуна',
      description: 'Безпечна мийка двигуна',
      durationMin: 30,
      price: 600,
      sortOrder: 7,
    },
    {
      name: 'Керамічне покриття',
      description: 'Нанесення керамічного захисного покриття',
      durationMin: 120,
      price: 3500,
      sortOrder: 8,
    },
  ];

  const services: { id: string; durationMin: number; price: number }[] = [];
  for (const sd of serviceDefs) {
    const svc = await prisma.service.create({
      data: {
        tenantId,
        name: sd.name,
        description: sd.description,
        durationMin: sd.durationMin,
        price: sd.price,
        isActive: true,
        sortOrder: sd.sortOrder,
      },
    });
    services.push({
      id: svc.id,
      durationMin: sd.durationMin,
      price: Number(sd.price),
    });
  }
  console.log(`Created ${services.length} services`);

  // =========================================================================
  // 5. Roles (Менеджер, Оператор, Рецепціоніст)
  // =========================================================================
  const allPerms = await prisma.permission.findMany();
  const permMap = new Map<string, string>();
  for (const p of allPerms) {
    permMap.set(`${p.module}:${p.action}`, p.id);
  }

  const roleDefs = [
    {
      name: 'Менеджер',
      description: 'Менеджер філіалу з розширеним доступом',
      permModules: [
        'branches:read',
        'users:read',
        'users:create',
        'users:update',
        'clients:read',
        'clients:create',
        'clients:update',
        'clients:delete',
        'vehicles:read',
        'vehicles:create',
        'vehicles:update',
        'services:read',
        'orders:read',
        'orders:create',
        'orders:update',
        'orders:delete',
        'scheduling:read',
        'payments:read',
        'payments:create',
        'payments:update',
        'analytics:view',
        'audit:read',
        'work-posts:read',
      ],
    },
    {
      name: 'Оператор',
      description: 'Оператор мийки',
      permModules: [
        'branches:read',
        'clients:read',
        'clients:create',
        'clients:update',
        'vehicles:read',
        'vehicles:create',
        'vehicles:update',
        'services:read',
        'orders:read',
        'orders:create',
        'orders:update',
        'scheduling:read',
        'payments:read',
        'payments:create',
        'work-posts:read',
      ],
    },
    {
      name: 'Рецепціоніст',
      description: 'Приймання замовлень та робота з клієнтами',
      permModules: [
        'branches:read',
        'clients:read',
        'clients:create',
        'clients:update',
        'vehicles:read',
        'vehicles:create',
        'services:read',
        'orders:read',
        'orders:create',
        'scheduling:read',
        'work-posts:read',
      ],
    },
  ];

  const roleIds: { name: string; id: string }[] = [];
  for (const rd of roleDefs) {
    const permIds = rd.permModules
      .map((key) => permMap.get(key))
      .filter((id): id is string => !!id);

    const role = await prisma.role.create({
      data: {
        tenantId,
        name: rd.name,
        description: rd.description,
        permissions: {
          create: permIds.map((pid) => ({ permissionId: pid })),
        },
      },
    });
    roleIds.push({ name: rd.name, id: role.id });
  }
  console.log(`Created ${roleIds.length} roles`);

  // =========================================================================
  // 6. Users (~18, 5-7 per branch)
  // =========================================================================
  const passwordHash = await argon2.hash('password123');

  const userDefs: {
    branchId: string;
    firstName: string;
    lastName: string;
    email: string;
    roleId: string;
  }[] = [];

  const usedEmails = new Set<string>();
  const staffPerBranch = [6, 5, 7];

  for (let bi = 0; bi < branches.length; bi++) {
    const branch = branches[bi];
    const count = staffPerBranch[bi];
    for (let u = 0; u < count; u++) {
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(LAST_NAMES);
      let email =
        `${firstName.toLowerCase()}.${lastName.toLowerCase()}@washflow.com`
          .replace(/і/g, 'i')
          .replace(/ї/g, 'yi')
          .replace(/є/g, 'ye')
          .replace(/а/g, 'a')
          .replace(/б/g, 'b')
          .replace(/в/g, 'v')
          .replace(/г/g, 'h')
          .replace(/ґ/g, 'g')
          .replace(/д/g, 'd')
          .replace(/е/g, 'e')
          .replace(/ж/g, 'zh')
          .replace(/з/g, 'z')
          .replace(/й/g, 'y')
          .replace(/к/g, 'k')
          .replace(/л/g, 'l')
          .replace(/м/g, 'm')
          .replace(/н/g, 'n')
          .replace(/о/g, 'o')
          .replace(/п/g, 'p')
          .replace(/р/g, 'r')
          .replace(/с/g, 's')
          .replace(/т/g, 't')
          .replace(/у/g, 'u')
          .replace(/ф/g, 'f')
          .replace(/х/g, 'kh')
          .replace(/ц/g, 'ts')
          .replace(/ч/g, 'ch')
          .replace(/ш/g, 'sh')
          .replace(/щ/g, 'shch')
          .replace(/ь/g, '')
          .replace(/ю/g, 'yu')
          .replace(/я/g, 'ya')
          .replace(/'/g, '');
      // Ensure unique
      while (usedEmails.has(email)) {
        email = email.replace('@', `${randInt(1, 99)}@`);
      }
      usedEmails.add(email);

      // Assign roles: first user per branch is Менеджер, next are Оператор/Рецепціоніст
      let roleId: string;
      if (u === 0) {
        roleId = roleIds.find((r) => r.name === 'Менеджер')!.id;
      } else if (u <= Math.ceil(count / 2)) {
        roleId = roleIds.find((r) => r.name === 'Оператор')!.id;
      } else {
        roleId = roleIds.find((r) => r.name === 'Рецепціоніст')!.id;
      }

      userDefs.push({
        branchId: branch.id,
        firstName,
        lastName,
        email,
        roleId,
      });
    }
  }

  const createdUserIds: string[] = [];
  for (const ud of userDefs) {
    const user = await prisma.user.create({
      data: {
        tenantId,
        branchId: ud.branchId,
        email: ud.email,
        passwordHash,
        firstName: ud.firstName,
        lastName: ud.lastName,
        phone: generatePhone(),
        isActive: true,
        isSuperAdmin: false,
        roleId: ud.roleId,
      },
    });
    createdUserIds.push(user.id);
  }
  console.log(`Created ${createdUserIds.length} users`);

  // =========================================================================
  // 6b. EmployeeProfiles (Managers + Operators = workers)
  // =========================================================================
  const receptionistRoleId = roleIds.find((r) => r.name === 'Рецепціоніст')!.id;
  const workerProfileRecords: any[] = [];
  for (let i = 0; i < userDefs.length; i++) {
    if (userDefs[i].roleId === receptionistRoleId) continue;
    workerProfileRecords.push({
      id: randomUUID(),
      tenantId,
      userId: createdUserIds[i],
      branchId: userDefs[i].branchId,
      isWorker: true,
      efficiencyCoefficient: 1,
      active: true,
      workStartTime: '08:00',
      workEndTime: '19:00',
    });
  }
  await insertInChunks(prisma.employeeProfile, workerProfileRecords);
  console.log(`Created ${workerProfileRecords.length} employee profiles`);

  // Collect all user IDs (admin + staff) for order createdById
  const allUserIds = [adminUserId, ...createdUserIds];

  // Branch -> user IDs mapping
  const branchUserIds = new Map<string, string[]>();
  for (let i = 0; i < userDefs.length; i++) {
    const bid = userDefs[i].branchId;
    if (!branchUserIds.has(bid)) branchUserIds.set(bid, []);
    branchUserIds.get(bid)!.push(createdUserIds[i]);
  }

  // =========================================================================
  // 7. Clients (250)
  // =========================================================================
  const startDate = new Date(now);
  startDate.setFullYear(startDate.getFullYear() - 1);

  const clientIds: string[] = [];
  const clientRecords: any[] = [];

  for (let i = 0; i < 250; i++) {
    const id = randomUUID();
    clientIds.push(id);

    // Clients created within first 3 months of the year span
    const daysOffset = randInt(0, 90);
    const createdAt = new Date(startDate.getTime() + daysOffset * 86_400_000);

    clientRecords.push({
      id,
      tenantId,
      firstName: pick(FIRST_NAMES),
      lastName: pick(LAST_NAMES),
      phone: generatePhone(),
      email: i < 150 ? `client${i + 1}@example.com` : null,
      notes: i % 10 === 0 ? 'Постійний клієнт' : null,
      createdAt,
      updatedAt: createdAt,
    });
  }

  await insertInChunks(prisma.client, clientRecords);
  console.log(`Created ${clientRecords.length} clients`);

  // =========================================================================
  // 8. Vehicles (~350, 1-3 per client)
  // =========================================================================
  const vehicleIds: string[] = [];
  const vehicleRecords: any[] = [];
  const clientVehicleMap = new Map<string, string[]>();

  for (let ci = 0; ci < clientIds.length; ci++) {
    const clientId = clientIds[ci];
    const vehicleCount = weightedPick([1, 2, 3], [50, 35, 15]);
    const clientCreatedAt = clientRecords[ci].createdAt as Date;
    const vIds: string[] = [];

    for (let v = 0; v < vehicleCount; v++) {
      const id = randomUUID();
      vehicleIds.push(id);
      vIds.push(id);

      const carMake = pick(CAR_DATA);
      const carModel = pick(carMake.models);
      // Vehicle created shortly after client
      const vCreatedAt = new Date(
        clientCreatedAt.getTime() + randInt(0, 14) * 86_400_000,
      );

      vehicleRecords.push({
        id,
        tenantId,
        clientId,
        make: carMake.make,
        model: carModel,
        color: pick(COLORS),
        year: randInt(2005, 2025),
        licensePlate: generateLicensePlate(),
        createdAt: vCreatedAt,
        updatedAt: vCreatedAt,
      });
    }
    clientVehicleMap.set(clientId, vIds);
  }

  await insertInChunks(prisma.vehicle, vehicleRecords);
  console.log(`Created ${vehicleRecords.length} vehicles`);

  // =========================================================================
  // 9. Orders (~2500), OrderServices, Payments, AuditLogs
  // =========================================================================
  const orderRecords: any[] = [];
  const orderServiceRecords: any[] = [];
  const paymentRecords: any[] = [];
  const auditLogRecords: any[] = [];

  // Build work posts per branch
  const branchWorkPosts = new Map<string, string[]>();
  for (const wp of workPosts) {
    if (!branchWorkPosts.has(wp.branchId)) branchWorkPosts.set(wp.branchId, []);
    branchWorkPosts.get(wp.branchId)!.push(wp.id);
  }

  // Day-by-day iteration
  const endDate = new Date(now);
  const currentDay = new Date(startDate);

  // Seven days from now boundary for status assignment
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  while (currentDay <= endDate) {
    const dayOfWeek = currentDay.getDay(); // 0=Sun
    if (dayOfWeek === 0) {
      // Skip Sundays
      currentDay.setDate(currentDay.getDate() + 1);
      continue;
    }

    const month = currentDay.getMonth(); // 0-indexed
    const seasonalWeight = SEASONAL_WEIGHTS[month];
    const isFuture = currentDay > now;
    const isPast = currentDay < sevenDaysAgo;

    for (const branch of branches) {
      const postsForBranch = branchWorkPosts.get(branch.id)!;
      const ordersToday =
        Math.floor(BASE_ORDERS_PER_BRANCH * seasonalWeight) + randInt(0, 1);

      // Track next available time per post
      const nextAvailable = new Map<string, Date>();
      for (const postId of postsForBranch) {
        nextAvailable.set(postId, setTime(currentDay, 8, 0));
      }

      for (let o = 0; o < ordersToday; o++) {
        // Pick 1-3 services with weighted probability
        const serviceCount = weightedPick([1, 2, 3], [55, 30, 15]);
        const chosenServices: {
          id: string;
          durationMin: number;
          price: number;
        }[] = [];
        const usedServiceIndices = new Set<number>();

        for (let s = 0; s < serviceCount; s++) {
          let idx: number;
          let attempts = 0;
          do {
            idx = randInt(0, services.length - 1);
            attempts++;
          } while (usedServiceIndices.has(idx) && attempts < 20);
          if (!usedServiceIndices.has(idx)) {
            usedServiceIndices.add(idx);
            chosenServices.push(services[idx]);
          }
        }

        if (chosenServices.length === 0) continue;

        const totalDuration = chosenServices.reduce(
          (sum, s) => sum + s.durationMin,
          0,
        );
        const totalPrice = chosenServices.reduce((sum, s) => sum + s.price, 0);

        // Find work post with earliest available time that can fit order before 19:00
        let bestPostId: string | null = null;
        let bestTime: Date | null = null;

        for (const postId of postsForBranch) {
          const avail = nextAvailable.get(postId)!;
          const orderEnd = addMinutes(avail, totalDuration);
          const cutoff = setTime(currentDay, 19, 0);
          if (orderEnd <= cutoff) {
            if (!bestTime || avail < bestTime) {
              bestTime = avail;
              bestPostId = postId;
            }
          }
        }

        if (!bestPostId || !bestTime) continue; // No room today

        const scheduledStart = new Date(bestTime);
        const scheduledEnd = addMinutes(scheduledStart, totalDuration);

        // Advance post availability
        const buffer = 10;
        const randomGap = randInt(0, 15);
        nextAvailable.set(
          bestPostId,
          addMinutes(scheduledEnd, buffer + randomGap),
        );

        // Pick client and vehicle
        const clientId = pick(clientIds);
        const clientVehicles = clientVehicleMap.get(clientId)!;
        const vehicleId = pick(clientVehicles);

        // Pick a user from this branch (or admin)
        const branchUsers = branchUserIds.get(branch.id) || [];
        const createdById =
          branchUsers.length > 0 ? pick(branchUsers) : adminUserId;

        // Determine status
        let status: string;
        let cancellationReason: string | null = null;

        if (isFuture) {
          status = 'BOOKED';
        } else if (isPast) {
          // Past orders (>7 days ago): 70% COMPLETED, 12% CANCELLED, 5% NO_SHOW, 8% BOOKED, 5% IN_PROGRESS
          status = weightedPick(
            ['COMPLETED', 'CANCELLED', 'NO_SHOW', 'BOOKED', 'IN_PROGRESS'],
            [70, 12, 5, 8, 5],
          );
        } else {
          // Recent orders (<7 days): 50% COMPLETED, 20% IN_PROGRESS, 15% BOOKED, 10% CANCELLED, 5% NO_SHOW
          status = weightedPick(
            ['COMPLETED', 'IN_PROGRESS', 'BOOKED', 'CANCELLED', 'NO_SHOW'],
            [50, 20, 15, 10, 5],
          );
        }

        if (status === 'CANCELLED') {
          cancellationReason = pick(CANCELLATION_REASONS);
        }

        // Source
        const source = weightedPick(
          ['INTERNAL', 'WEB', 'WIDGET', 'API'],
          [60, 20, 15, 5],
        );

        const orderId = randomUUID();
        const orderCreatedAt = addMinutes(scheduledStart, -randInt(30, 1440)); // created 30min to 1 day before

        orderRecords.push({
          id: orderId,
          tenantId,
          branchId: branch.id,
          clientId,
          vehicleId,
          workPostId: bestPostId,
          createdById,
          status,
          source,
          scheduledStart,
          scheduledEnd,
          totalPrice,
          notes: null,
          cancellationReason,
          createdAt: orderCreatedAt,
          updatedAt: scheduledStart, // last updated at the scheduled time
        });

        // OrderServices
        for (const svc of chosenServices) {
          orderServiceRecords.push({
            id: randomUUID(),
            tenantId,
            orderId,
            serviceId: svc.id,
            price: svc.price,
            quantity: 1,
          });
        }

        // Payment for COMPLETED orders
        if (status === 'COMPLETED') {
          const method = weightedPick(['CASH', 'CARD', 'ONLINE'], [40, 50, 10]);

          paymentRecords.push({
            id: randomUUID(),
            tenantId,
            orderId,
            amount: totalPrice,
            method,
            status: 'PAID',
            reference:
              method === 'ONLINE'
                ? `PAY-${randomUUID().slice(0, 8).toUpperCase()}`
                : null,
            createdAt: scheduledEnd,
            updatedAt: scheduledEnd,
          });
        }

        // AuditLog
        auditLogRecords.push({
          id: randomUUID(),
          tenantId,
          entityType: 'Order',
          entityId: orderId,
          action: 'CREATE',
          oldValue: null,
          newValue: { status, totalPrice },
          performedById: createdById,
          metadata: { source },
          createdAt: orderCreatedAt,
        });

        // Additional audit log for status changes
        if (status === 'COMPLETED') {
          auditLogRecords.push({
            id: randomUUID(),
            tenantId,
            entityType: 'Order',
            entityId: orderId,
            action: 'STATUS_CHANGE',
            oldValue: { status: 'IN_PROGRESS' },
            newValue: { status: 'COMPLETED' },
            performedById: createdById,
            metadata: null,
            createdAt: scheduledEnd,
          });
        } else if (status === 'CANCELLED') {
          auditLogRecords.push({
            id: randomUUID(),
            tenantId,
            entityType: 'Order',
            entityId: orderId,
            action: 'STATUS_CHANGE',
            oldValue: { status: 'BOOKED' },
            newValue: { status: 'CANCELLED', cancellationReason },
            performedById: createdById,
            metadata: null,
            createdAt: addMinutes(orderCreatedAt, randInt(10, 120)),
          });
        }
      }
    }

    currentDay.setDate(currentDay.getDate() + 1);
  }

  // Bulk insert orders
  console.log(`Inserting ${orderRecords.length} orders...`);
  await insertInChunks(prisma.order, orderRecords);

  // Bulk insert order services
  console.log(`Inserting ${orderServiceRecords.length} order services...`);
  await insertInChunks(prisma.orderService, orderServiceRecords);

  // Bulk insert payments
  console.log(`Inserting ${paymentRecords.length} payments...`);
  await insertInChunks(prisma.payment, paymentRecords);

  // Bulk insert audit logs
  console.log(`Inserting ${auditLogRecords.length} audit logs...`);
  await insertInChunks(prisma.auditLog, auditLogRecords);

  console.log('\n--- Realistic data seeding complete ---');
  console.log(`  Branches: ${branches.length}`);
  console.log(`  Work Posts: ${workPosts.length}`);
  console.log(`  Services: ${services.length}`);
  console.log(`  Roles: ${roleIds.length}`);
  console.log(`  Staff Users: ${createdUserIds.length}`);
  console.log(`  Employee Profiles: ${workerProfileRecords.length}`);
  console.log(`  Clients: ${clientRecords.length}`);
  console.log(`  Vehicles: ${vehicleRecords.length}`);
  console.log(`  Orders: ${orderRecords.length}`);
  console.log(`  Order Services: ${orderServiceRecords.length}`);
  console.log(`  Payments: ${paymentRecords.length}`);
  console.log(`  Audit Logs: ${auditLogRecords.length}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Seed permissions
  console.log('Seeding permissions...');

  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: {
        module_action: { module: perm.module, action: perm.action },
      },
      update: { description: perm.description },
      create: perm,
    });
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions`);

  // 2. Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      id: DEMO_TENANT_ID,
      name: 'WashFlow Demo',
      slug: 'demo',
      isActive: true,
    },
  });

  console.log(`Tenant: ${tenant.name} (id: ${tenant.id})`);

  // 3. Create admin role with all permissions
  const allPermissions = await prisma.permission.findMany();

  let adminRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, name: 'Admin' },
  });

  if (!adminRole) {
    adminRole = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: 'Admin',
        description: 'Full access administrator role',
        permissions: {
          create: allPermissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });
    console.log(`Created Admin role with ${allPermissions.length} permissions`);
  } else {
    console.log('Admin role already exists, skipping');
  }

  // 4. Create super admin user
  let adminUser = await prisma.user.findFirst({
    where: { email: 'admin@washflow.com' },
  });

  if (!adminUser) {
    const passwordHash = await argon2.hash('admin123');

    adminUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@washflow.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'User',
        isSuperAdmin: true,
        isActive: true,
        roleId: adminRole.id,
      },
    });

    console.log(
      `Created super admin user: ${adminUser.email} (id: ${adminUser.id})`,
    );
  } else {
    console.log(`Super admin user already exists: ${adminUser.email}`);
  }

  // 5. Seed realistic data
  await seedRealisticData(tenant.id, adminUser!.id);

  console.log('\n--- Login credentials ---');
  console.log('Email:     admin@washflow.com');
  console.log('Password:  admin123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
