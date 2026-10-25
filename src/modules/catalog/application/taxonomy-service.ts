import type { RecordAudit } from "@/modules/audit/application/record-audit";
import { assertPermission, type AuthUser } from "@/modules/auth/domain/permissions";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/domain/errors";
import type { TaxonomyRepository } from "./ports";

export type TaxonomyKind = "category" | "unit";

export const TAXONOMY_LABELS: Record<TaxonomyKind, { singular: string; article: string }> = {
  category: { singular: "categoría", article: "La" },
  unit: { singular: "unidad", article: "La" },
};

export const MAX_TAXONOMY_NAME_LENGTH = 80;

export interface TaxonomyDeps {
  categories: TaxonomyRepository;
  units: TaxonomyRepository;
  audit: RecordAudit;
}

/** Admin of categories and units: create, rename, activate/deactivate, delete when unused. */
export function createTaxonomyService({ categories, units, audit }: TaxonomyDeps) {
  const repositories: Record<TaxonomyKind, TaxonomyRepository> = { category: categories, unit: units };

  function cleanName(kind: TaxonomyKind, raw: string): string {
    const name = raw.trim().replace(/\s+/g, " ");
    const label = TAXONOMY_LABELS[kind];
    if (name.length === 0) throw new ValidationError("Name required", { name: [`Ingresá el nombre de la ${label.singular}.`] });
    if (name.length > MAX_TAXONOMY_NAME_LENGTH) {
      throw new ValidationError("Name too long", { name: [`El nombre no puede superar los ${MAX_TAXONOMY_NAME_LENGTH} caracteres.`] });
    }
    return name;
  }

  async function assertNameFree(kind: TaxonomyKind, name: string, exceptId?: string) {
    const existing = await repositories[kind].findByName(name);
    if (existing && existing.id !== exceptId) {
      const message = `Ya existe ${kind === "category" ? "una categoría" : "una unidad"} con ese nombre.`;
      throw new ConflictError("Duplicate name", message, { name: [message] });
    }
  }

  async function requireItem(kind: TaxonomyKind, id: string) {
    const item = await repositories[kind].findById(id);
    if (!item) throw new NotFoundError(kind);
    return item;
  }

  async function list(actor: AuthUser, kind: TaxonomyKind) {
    assertPermission(actor, "products.read");
    return repositories[kind].list();
  }

  async function create(actor: AuthUser, kind: TaxonomyKind, rawName: string, ip?: string) {
    assertPermission(actor, "catalog.manage");
    const name = cleanName(kind, rawName);
    await assertNameFree(kind, name);
    const created = await repositories[kind].create(name);
    await audit({ actorId: actor.id, action: `${kind}.create`, entityType: kind, entityId: created.id, after: { name }, ip });
    return created;
  }

  async function rename(actor: AuthUser, kind: TaxonomyKind, id: string, rawName: string, ip?: string) {
    assertPermission(actor, "catalog.manage");
    const name = cleanName(kind, rawName);
    const item = await requireItem(kind, id);
    if (item.name === name) return;
    await assertNameFree(kind, name, id);
    await repositories[kind].rename(id, name);
    await audit({ actorId: actor.id, action: `${kind}.rename`, entityType: kind, entityId: id, before: { name: item.name }, after: { name }, ip });
  }

  async function setActive(actor: AuthUser, kind: TaxonomyKind, id: string, active: boolean, ip?: string) {
    assertPermission(actor, "catalog.manage");
    const item = await requireItem(kind, id);
    if (item.active === active) return;
    await repositories[kind].setActive(id, active);
    await audit({
      actorId: actor.id,
      action: `${kind}.${active ? "activate" : "deactivate"}`,
      entityType: kind,
      entityId: id,
      before: { active: item.active },
      after: { active },
      ip,
    });
  }

  async function remove(actor: AuthUser, kind: TaxonomyKind, id: string, ip?: string) {
    assertPermission(actor, "catalog.manage");
    const item = await requireItem(kind, id);
    if (item.productCount > 0) {
      throw new ConflictError(
        "Taxonomy item in use",
        `No se puede eliminar: ${item.productCount === 1 ? "hay 1 producto que la usa" : `hay ${item.productCount} productos que la usan`}. Podés desactivarla.`,
      );
    }
    await repositories[kind].delete(id);
    await audit({ actorId: actor.id, action: `${kind}.delete`, entityType: kind, entityId: id, before: { name: item.name }, ip });
  }

  return { list, create, rename, setActive, remove };
}

export type TaxonomyService = ReturnType<typeof createTaxonomyService>;
