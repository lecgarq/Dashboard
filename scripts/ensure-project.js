const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const project = await db.project.findFirst();
  if (!project) {
    console.log('No project found. Creating default project...');
    await db.project.create({
      data: {
        id: 'default-project-' + Math.random().toString(36).substr(2, 9),
        name: 'Default Project',
      },
    });
    console.log('Project created.');
  } else {
    console.log('Project exists:', project.id);
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
