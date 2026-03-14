import { FastifyInstance } from "fastify"
import { z } from "zod"
import { eq, and, sql } from "drizzle-orm"
import { db, jobTemplates, jobPostings } from "../db"
import { requireEmployer } from "../middleware/auth"

const MAX_TEMPLATES_PER_EMPLOYER = 20

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1),
  category: z.string().min(1).max(100),
  hourlyRate: z.number().int().positive(),
  requiredSkills: z.array(z.string()).default([]),
  durationHours: z.number().int().positive(),
  headcount: z.number().int().min(1).max(100).default(1),
})

const updateTemplateSchema = createTemplateSchema.partial()

const createJobFromTemplateSchema = z.object({
  startAt: z.string().datetime(),
  headcount: z.number().int().min(1).max(100).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1).max(500),
})

export async function jobTemplateRoutes(app: FastifyInstance) {
  // POST /employer/job-templates - create a new template
  app.post("/employer/job-templates", { preHandler: [requireEmployer] }, async (request, reply) => {
    const body = createTemplateSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    const employerId = request.user.id

    // Check limit
    const countResult = await db.execute<{ count: string }>(
      sql`SELECT COUNT(*) as count FROM job_templates WHERE employer_id = ${employerId}`
    )
    const templateCount = Number(countResult.rows[0]?.count ?? 0)

    if (templateCount >= MAX_TEMPLATES_PER_EMPLOYER) {
      return reply.status(400).send({ error: `Maximum ${MAX_TEMPLATES_PER_EMPLOYER} templates allowed per employer` })
    }

    const { name, description, category, hourlyRate, requiredSkills, durationHours, headcount } = body.data

    const [template] = await db
      .insert(jobTemplates)
      .values({
        employerId,
        name,
        description,
        category,
        hourlyRate,
        requiredSkills,
        durationHours,
        headcount,
      })
      .returning()

    return reply.status(201).send({ template })
  })

  // GET /employer/job-templates - list all templates for the employer
  app.get("/employer/job-templates", { preHandler: [requireEmployer] }, async (request, reply) => {
    const employerId = request.user.id

    const templates = await db
      .select()
      .from(jobTemplates)
      .where(eq(jobTemplates.employerId, employerId))

    return reply.send({ templates })
  })

  // GET /employer/job-templates/:id - get a single template
  app.get("/employer/job-templates/:id", { preHandler: [requireEmployer] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const employerId = request.user.id

    const [template] = await db
      .select()
      .from(jobTemplates)
      .where(and(eq(jobTemplates.id, id), eq(jobTemplates.employerId, employerId)))
      .limit(1)

    if (!template) {
      return reply.status(404).send({ error: "Template not found" })
    }

    return reply.send({ template })
  })

  // PUT /employer/job-templates/:id - update a template
  app.put("/employer/job-templates/:id", { preHandler: [requireEmployer] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const employerId = request.user.id

    const body = updateTemplateSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(jobTemplates)
      .where(and(eq(jobTemplates.id, id), eq(jobTemplates.employerId, employerId)))
      .limit(1)

    if (!existing) {
      return reply.status(404).send({ error: "Template not found" })
    }

    const [updated] = await db
      .update(jobTemplates)
      .set({ ...body.data, updatedAt: new Date() })
      .where(eq(jobTemplates.id, id))
      .returning()

    return reply.send({ template: updated })
  })

  // DELETE /employer/job-templates/:id - delete a template
  app.delete("/employer/job-templates/:id", { preHandler: [requireEmployer] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const employerId = request.user.id

    const [existing] = await db
      .select()
      .from(jobTemplates)
      .where(and(eq(jobTemplates.id, id), eq(jobTemplates.employerId, employerId)))
      .limit(1)

    if (!existing) {
      return reply.status(404).send({ error: "Template not found" })
    }

    await db.delete(jobTemplates).where(eq(jobTemplates.id, id))

    return reply.status(204).send()
  })

  // POST /employer/job-templates/:id/create-job - create a job posting from template
  app.post("/employer/job-templates/:id/create-job", { preHandler: [requireEmployer] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const employerId = request.user.id

    const body = createJobFromTemplateSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
    }

    // Verify ownership
    const [template] = await db
      .select()
      .from(jobTemplates)
      .where(and(eq(jobTemplates.id, id), eq(jobTemplates.employerId, employerId)))
      .limit(1)

    if (!template) {
      return reply.status(403).send({ error: "Template not found or access denied" })
    }

    const { startAt, headcount, lat, lng, address } = body.data

    const startDate = new Date(startAt)
    const endDate = new Date(startDate.getTime() + template.durationHours * 60 * 60 * 1000)
    const finalHeadcount = headcount ?? template.headcount
    const totalAmount = Math.round(template.hourlyRate * template.durationHours * finalHeadcount)

    const [job] = await db
      .insert(jobPostings)
      .values({
        employerId,
        templateId: template.id,
        title: template.name,
        category: template.category,
        startAt: startDate,
        endAt: endDate,
        hourlyRate: template.hourlyRate,
        totalAmount,
        headcount: finalHeadcount,
        location: { lat, lng } as any,
        address,
        description: template.description,
      })
      .returning()

    return reply.status(201).send({ job })
  })

  // POST /employer/job-templates/:id/clone — clone a template
  app.post<{ Params: { id: string } }>(
    "/employer/job-templates/:id/clone",
    { preHandler: [requireEmployer] },
    async (request, reply) => {
      const { id } = request.params
      const employerId = request.user.id

      const overrideSchema = z.object({
        title_override: z.string().min(1).max(200).optional(),
        overrides: z.object({
          hourlyRate: z.number().int().positive().optional(),
          headcount: z.number().int().min(1).max(100).optional(),
          description: z.string().min(1).optional(),
        }).optional(),
      })

      const body = overrideSchema.safeParse(request.body ?? {})
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
      }

      // Verify ownership
      const [template] = await db
        .select()
        .from(jobTemplates)
        .where(and(eq(jobTemplates.id, id), eq(jobTemplates.employerId, employerId)))
        .limit(1)

      if (!template) {
        return reply.status(403).send({ error: "Template not found or access denied" })
      }

      // Check template limit before cloning
      const countResult = await db.execute<{ count: string }>(
        sql`SELECT COUNT(*) as count FROM job_templates WHERE employer_id = ${employerId}`
      )
      const templateCount = Number(countResult.rows[0]?.count ?? 0)
      if (templateCount >= MAX_TEMPLATES_PER_EMPLOYER) {
        return reply.status(400).send({ error: `Maximum ${MAX_TEMPLATES_PER_EMPLOYER} templates allowed per employer` })
      }

      const cloneTitle = body.data.title_override ?? `(복사) ${template.name}`
      const overrides = body.data.overrides ?? {}

      const [cloned] = await db
        .insert(jobTemplates)
        .values({
          employerId,
          name: cloneTitle,
          description: overrides.description ?? template.description,
          category: template.category,
          hourlyRate: overrides.hourlyRate ?? template.hourlyRate,
          requiredSkills: template.requiredSkills,
          durationHours: template.durationHours,
          headcount: overrides.headcount ?? template.headcount,
        })
        .returning()

      return reply.status(201).send({
        id: cloned.id,
        title: cloned.name,
        createdAt: cloned.createdAt,
        clonedFrom: id,
      })
    }
  )

  // PATCH /employer/job-templates/:id — partial update
  app.patch<{ Params: { id: string } }>(
    "/employer/job-templates/:id",
    { preHandler: [requireEmployer] },
    async (request, reply) => {
      const { id } = request.params
      const employerId = request.user.id

      const body = updateTemplateSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() })
      }

      const [template] = await db
        .select({ id: jobTemplates.id })
        .from(jobTemplates)
        .where(and(eq(jobTemplates.id, id), eq(jobTemplates.employerId, employerId)))
        .limit(1)

      if (!template) {
        return reply.status(403).send({ error: "Template not found or access denied" })
      }

      const [updated] = await db
        .update(jobTemplates)
        .set({ ...body.data, updatedAt: new Date() })
        .where(eq(jobTemplates.id, id))
        .returning()

      return reply.send({ template: updated })
    }
  )

  // GET /employer/job-templates/:id/preview — render preview posting (non-persisted)
  app.get<{ Params: { id: string } }>(
    "/employer/job-templates/:id/preview",
    { preHandler: [requireEmployer] },
    async (request, reply) => {
      const { id } = request.params
      const employerId = request.user.id

      const [template] = await db
        .select()
        .from(jobTemplates)
        .where(and(eq(jobTemplates.id, id), eq(jobTemplates.employerId, employerId)))
        .limit(1)

      if (!template) {
        return reply.status(403).send({ error: "Template not found or access denied" })
      }

      const estimatedEndTime = template.durationHours
      const estimatedTotalPay = template.hourlyRate * template.durationHours * template.headcount

      return reply.send({
        preview: {
          title: template.name,
          description: template.description,
          category: template.category,
          hourlyRate: template.hourlyRate,
          estimatedDurationHours: estimatedEndTime,
          estimatedTotalPay,
          headcount: template.headcount,
          requiredSkills: template.requiredSkills,
        },
        templateId: id,
        note: "이 미리보기는 저장되지 않습니다. 실제 공고를 생성하려면 POST /employer/job-templates/:id/jobs를 사용하세요.",
      })
    }
  )
}
