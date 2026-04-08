import prisma from '../../shared/db';
import { HashTable } from '../utils/hash-context.util';

export interface TemplateData {
  id: string;
  provider: string;
  variant: string;
  template: string;
  hashTable: HashTable | null;
}

export class TemplateRuleDAO {
  async findByProvider(provider: string, variant?: string): Promise<TemplateData | null> {
    // NEW: Support variant lookup (fallback to latest if not specified)
    const record = await prisma.emailTemplateRule.findFirst({
      where: {
        provider,
        ...(variant && { variant }),
      },
      orderBy: { createdAt: 'desc' }, // Fallback to latest if variant not found
    });

    if (!record) return null;

    const rules = record.rules as any;
    return {
      id: record.id,
      provider: record.provider,
      variant: record.variant,
      template: rules.template,
      hashTable: record.hashTable as HashTable | null,
    };
  }

  async findAllByProvider(provider: string): Promise<TemplateData[]> {
    const records = await prisma.emailTemplateRule.findMany({
      where: { provider },
      orderBy: { updatedAt: 'desc' },
    });

    return records.map((record) => {
      const rules = record.rules as any;
      return {
        id: record.id,
        provider: record.provider,
        variant: record.variant,
        template: rules.template,
        hashTable: record.hashTable as HashTable | null,
      };
    });
  }

  async create(provider: string, variant: string, template: string, hashTable?: HashTable): Promise<void> {
    // NEW: Include variant in upsert (composite key)
    await prisma.emailTemplateRule.upsert({
      where: { provider_variant: { provider, variant } },
      update: {
        rules: { template } as any,
        hashTable: hashTable ? (hashTable as any) : null,
      },
      create: {
        provider,
        variant,
        rules: { template } as any,
        hashTable: hashTable ? (hashTable as any) : null,
      },
    });
  }

  async update(provider: string, variant: string, template: string, hashTable?: HashTable): Promise<void> {
    // NEW: Include variant in update (composite key)
    await prisma.emailTemplateRule.update({
      where: { provider_variant: { provider, variant } },
      data: { 
        rules: { template },
        hashTable: hashTable ? (hashTable as any) : null,
      },
    });
  }

  async delete(provider: string, variant?: string): Promise<void> {
    // NEW: Support variant-specific deletion
    if (variant) {
      await prisma.emailTemplateRule.delete({
        where: { provider_variant: { provider, variant } },
      });
    } else {
      // Delete all variants for this provider if not specified
      await prisma.emailTemplateRule.deleteMany({
        where: { provider },
      });
    }
  }
}
