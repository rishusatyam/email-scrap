import prisma from '../../shared/db';
import { HashTable } from '../utils/hash-context.util';

export interface TemplateData {
  template: string;
  hashTable: HashTable | null;
}

export class TemplateRuleDAO {
  async findByProvider(provider: string): Promise<TemplateData | null> {
    const record = await prisma.emailTemplateRule.findUnique({
      where: { provider },
    });

    if (!record) return null;

    const rules = record.rules as any;
    return {
      template: rules.template,
      hashTable: record.hashTable as HashTable | null,
    };
  }

  async create(provider: string, template: string, hashTable?: HashTable): Promise<void> {
    await prisma.emailTemplateRule.upsert({
      where: { provider },
      update: {
        rules: { template } as any,
        hashTable: hashTable ? (hashTable as any) : null,
      },
      create: {
        provider,
        rules: { template } as any,
        hashTable: hashTable ? (hashTable as any) : null,
      },
    });
  }

  async update(provider: string, template: string, hashTable?: HashTable): Promise<void> {
    await prisma.emailTemplateRule.update({
      where: { provider },
      data: { 
        rules: { template },
        hashTable: hashTable ? (hashTable as any) : null,
      },
    });
  }

  async delete(provider: string): Promise<void> {
    await prisma.emailTemplateRule.delete({
      where: { provider },
    });
  }
}
