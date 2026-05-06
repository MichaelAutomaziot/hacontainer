# Ran Faina - Product Sync Pilot — Automaziot Implementation

{
  "data": {
    "systems": [
      {
        "system_name": "n8n",
        "system_type": "built",
        "status": "active",
        "notes": "Primary workflow engine for catalog ingestion, comparison, publishing, and validation flows. Will run on Railway and connect to Supabase, Mirakl, and optional LLM services.",
        "url": "https://primary-production-6ba3b.up.railway.app",
        "credentials": null
      },
      {
        "system_name": "Railway",
        "system_type": "built",
        "status": "active",
        "notes": "Cloud hosting platform for the pilot environment. Use the selected workspace 'Ran Fayna's Projects' for service deployment and environment variable management.",
        "url": null,
        "credentials": null
      },
      {
        "system_name": "Supabase",
        "system_type": "built",
        "status": "pending_setup",
        "notes": "Will store normalized product records, comparison results, publishing queue, validation errors, and dashboard data for the central Product Hub.",
        "url": null,
        "credentials": null
      },
      {
        "system_name": "Koonim-Bo (קונים-בו)",
        "system_type": "accessed",
        "status": "pending_setup",
        "notes": "Source catalog system to ingest product data from The Container storefront. Access method must be confirmed after credentials review; may require browser automation, exports, or available API endpoints.",
        "url": null,
        "credentials": null
      },
      {
        "system_name": "The Container (הקונטיינר)",
        "system_type": "accessed",
        "status": "pending_setup",
        "notes": "Reference storefront/catalog used to validate source product coverage, category structure, filters, pricing, and shipping-related attributes.",
        "url": null,
        "credentials": null
      },
      {
        "system_name": "Super-Pharm Marketplace",
        "system_type": "accessed",
        "status": "pending_setup",
        "notes": "Target marketplace where product gaps will be identified and approved products uploaded. Business rules and compliance checks depend on official marketplace requirements.",
        "url": null,
        "credentials": null
      },
      {
        "system_name": "Mirakl Seller API",
        "system_type": "integration",
        "status": "pending_setup",
        "notes": "Preferred publishing interface for product creation and updates to Super-Pharm. API permission is not yet confirmed, so implementation must allow fallback to manual/interface-assisted review if needed.",
        "url": null,
        "credentials": null
      },
      {
        "system_name": "OpenRouter",
        "system_type": "integration",
        "status": "pending_setup",
        "notes": "Optional LLM layer for product matching assistance, Hebrew content cleanup, attribute normalization, and validation support; not used for deterministic pricing logic.",
        "url": null,
        "credentials": null
      }
    ],
    "tasks": [
      {
        "temp_id": "TASK-001",
        "title": "Clone repo and set up development environment",
        "description": "1. Clone the repository: git clone https://github.com/automaziot-ai/project-ran-faina\n2. Open with Claude Code: cd project-ran-faina && claude\n3. Install required plugins:\n   /plugin install automaziot-ai/superpowers-automaziot\n   /plugin install anthropics/claude-plugins-official\n   /plugin install wshobson/agents\n4. Read CLAUDE.md for full project context\n5. Set up environment variables per .env.example\n6. Verify all MCP connections are working",
        "task_type": "plan",
        "priority": "urgent",
        "estimated_hours": 0.5,
        "waiting_for_client": false,
        "worker_geo_preference": "global_any",
        "depends_on": [],
        "subtasks": []
      },
      {
        "temp_id": "TASK-002",
        "title": "Verify service access and create project admin accounts",
        "description": "Confirm access to Railway workspace, first-login admin setup for n8n, validate existing deployment URLs, and provision/verify Supabase project access under the client-approved email. Document all environment variables and unresolved access gaps.",
        "task_type": "setup_system",
        "priority": "urgent",
        "estimated_hours": 3,
        "waiting_for_client": true,
        "worker_geo_preference": "local_il",
        "depends_on": [
          "TASK-001"
        ],
        "subtasks": []
      },
      {
        "temp_id": "TASK-003",
        "title": "Collect missing credentials and official Super-Pharm requirements",
        "description": "Get Koonim-Bo username/password, Mirakl or Super-Pharm credentials, API permission confirmation, and the official marketplace upload requirements from Perry or the client. Clarify whether competitive repricing is in pilot scope or deferred.",
        "task_type": "gather_info",
        "priority": "urgent",
        "estimated_hours": 2,
        "waiting_for_client": true,
        "worker_geo_preference": "local_il",
        "depends_on": [],
        "subtasks": []
      },
      {
        "temp_id": "TASK-004",
        "title": "Design Product Hub schema and marketplace mapping rules",
        "description": "Define Supabase tables for source products, normalized attributes, Super-Pharm match status, approval queue, publish attempts, and validation errors. Map pricing, shipping, promo dates, barcode, image, and Hebrew text rules into deterministic fields and flags.\nUse /api-docs-collector to save Mirakl and source-system docs",
        "task_type": "plan",
        "priority": "high",
        "estimated_hours": 4,
        "waiting_for_client": false,
        "worker_geo_preference": "global_any",
        "depends_on": [
          "TASK-002",
          "TASK-003"
        ],
        "subtasks": []
      },
      {
        "temp_id": "TASK-005",
        "title": "Build source catalog ingestion workflow from Koonim-Bo and The Container",
        "description": "Create n8n flow to pull or scrape source catalog data, normalize categories and filters, capture price and shipping inputs, and write canonical product records into Supabase. Include retry handling and change-detection for future sync runs.\nUse /n8n-workflow-patterns and /n8n-node-configuration",
        "task_type": "build_workflow",
        "priority": "high",
        "estimated_hours": 6,
        "waiting_for_client": false,
        "worker_geo_preference": "global_any",
        "depends_on": [
          "TASK-004"
        ],
        "subtasks": [
          {
            "title": "Source access method implementation",
            "description": "Implement the confirmed ingestion method: API, export, or browser-based retrieval.",
            "sort_order": 1
          },
          {
            "title": "Normalization and storage",
            "description": "Normalize raw catalog fields and upsert clean product records into Supabase.",
            "sort_order": 2
          }
        ]
      },
      {
        "temp_id": "TASK-006",
        "title": "Build missing-product comparison workflow for Super-Pharm",
        "description": "Create n8n flow that compares source products against existing Super-Pharm listings, identifies missing SKUs/products, and marks ambiguous matches for review. Include logging for low-confidence matches and category-level coverage reporting.\nUse /n8n-workflow-patterns, /n8n-node-configuration, and /n8n-code-javascript",
        "task_type": "build_workflow",
        "priority": "high",
        "estimated_hours": 6,
        "waiting_for_client": false,
        "worker_geo_preference": "global_any",
        "depends_on": [
          "TASK-005"
        ],
        "subtasks": []
      },
      {
        "temp_id": "TASK-007",
        "title": "Build Mirakl publishing integration with pricing, shipping, and promo rules",
        "description": "Implement publish/update flow to Super-Pharm through Mirakl using source selling price, configured shipping logic, default 39 ILS marketplace shipping, and one-month promo dates. Support fallback review mode if API permissions are limited.\nUse /n8n-workflow-patterns, /n8n-node-configuration, and /n8n-validation-expert",
        "task_type": "integration",
        "priority": "high",
        "estimated_hours": 8,
        "waiting_for_client": false,
        "worker_geo_preference": "global_any",
        "depends_on": [
          "TASK-004",
          "TASK-006"
        ],
        "subtasks": [
          {
            "title": "Rule engine implementation",
            "description": "Apply approved pricing, shipping, and promo-date business rules before publish.",
            "sort_order": 1
          },
          {
            "title": "Mirakl submission and status tracking",
            "description": "Send records to Mirakl and persist submission outcomes, IDs, and rejection details.",
            "sort_order": 2
          }
        ]
      },
      {
        "temp_id": "TASK-008",
        "title": "Build Product Hub review queue and dashboard",
        "description": "Create the central dashboard on Supabase for missing products, validation failures, approval status, and publish history. Include filters by category, source/target status, and exception reasons so the pilot can be reviewed before bulk upload.\nUse /client-dashboard",
        "task_type": "crm_config",
        "priority": "medium",
        "estimated_hours": 7,
        "waiting_for_client": false,
        "worker_geo_preference": "global_any",
        "depends_on": [
          "TASK-004",
          "TASK-006"
        ],
        "subtasks": []
      },
      {
        "temp_id": "TASK-009",
        "title": "Configure Hebrew content cleanup and compliance assistant",
        "description": "Create the AI-assisted enrichment layer for Hebrew titles, descriptions, and attribute cleanup to reduce Super-Pharm rejections on text quality, missing attributes, and formatting. Keep all pricing logic outside the model.\nUse /system-message-architect",
        "task_type": "build_agent",
        "priority": "medium",
        "estimated_hours": 5,
        "waiting_for_client": false,
        "worker_geo_preference": "local_il",
        "depends_on": [
          "TASK-004"
        ],
        "subtasks": [
          {
            "title": "Prompt and rule design",
            "description": "Define Hebrew cleanup instructions, forbidden changes, and output schema.",
            "sort_order": 1
          },
          {
            "title": "Workflow connection",
            "description": "Attach the assistant to the review queue for optional enrichment before publish.",
            "sort_order": 2
          }
        ]
      },
      {
        "temp_id": "TASK-010",
        "title": "Run pilot QA on sample products and finalize handoff",
        "description": "Test the full flow on a sample set of real missing products, verify marketplace rule handling, review rejection patterns, and prepare client-facing handoff notes with next-step recommendations for scaling beyond the pilot.",
        "task_type": "communicate",
        "priority": "high",
        "estimated_hours": 2.5,
        "waiting_for_client": true,
        "worker_geo_preference": "local_il",
        "depends_on": [
          "TASK-007",
          "TASK-008"
        ],
        "subtasks": []
      }
    ]
  }
}

---

## Supabase Schema Reference

All project data lives in Supabase. Use the Supabase MCP server to query. Three schemas:

### Schema: `ongoing_clients_automaziot` (Main Project Data)

**`projects`** — Project records
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | Project display name |
| status | enum | planning, active, blocked, on_hold, done |
| client_proposal_id | uuid | FK → automaziot.client_proposals — **use this to find transcriptions** |
| client_id | bigint | FK → clients |
| primary_developer_id | bigint | FK → developers |
| deadline | timestamptz | |
| github_repo_url | text | This repo's URL |
| phase3_completed_at | timestamptz | When implementation tasks were generated |
| journey_phase_override | text | Manual journey phase override |
| manager_notes | text | PM-only notes |

**`project_tasks`** — All tasks for a project
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK → projects |
| task_number | int | Auto-increment per project |
| title | text | Task title (Hebrew) |
| description | text | Detailed description |
| task_type | enum | build_workflow, build_agent, setup_system, integration, gather_info, plan, crm_config, communicate |
| status | enum | backlog, need_more_details, in_progress, testing, review, blocked, done |
| priority | enum | urgent, high, normal, low |
| assigned_to_id | bigint | FK → developers |
| estimated_hours | numeric | |
| actual_hours | numeric | |
| waiting_for_client | bool | Blocked on client action |
| waiting_for_details | text[] | What we're waiting for |
| blocked_reason | text | |
| depends_on_task_ids | uuid[] | Task dependencies |
| systems_involved | text[] | |
| workflow_platform | text | Usually 'n8n' |
| trigger_type | enum | webhook, schedule, manual, incoming_message, form_submit, api_call |
| worker_geo_preference | enum | local_il, global_any |
| credentials | jsonb | Task-specific credentials |
| testing | jsonb | {local: bool, production: bool} |
| deployed_workflow_url | text | |
| tags | text[] | |

**`task_subtasks`** — Checklist items within tasks
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| task_id | uuid | FK → project_tasks |
| title | text | |
| description | text | |
| is_completed | bool | |
| sort_order | int | |
| estimated_hours | numeric | |
| assignee_id | bigint | FK → developers |

**`task_comments`** — Comments on tasks
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| task_id | uuid | FK → project_tasks |
| author_id | bigint | FK → developers |
| content | text | |

**`client_systems`** — Systems and credentials for this project
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| project_id | uuid | FK → projects |
| system_name | text | |
| system_type | enum | created, accessed |
| status | enum | active, inactive, pending_setup |
| access_url | text | |
| credentials | jsonb | **Never hardcode — update via MCP** |
| notes | text | |

**`transcriptions`** — Sales and kickoff call recordings
| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| client_proposal_id | uuid | **Link to project via project.client_proposal_id** |
| interaction_purpose | enum | sales_discovery, project_kickoff, information_gathering, etc. |
| call_date | timestamptz | |
| ai_summary | text | AI-generated summary |
| key_points | text[] | |
| key_decisions | text[] | |
| action_items | jsonb | [{description, assignee, due_date, completed}] |
| client_concerns | jsonb | [{concern, severity, addressed}] |
| client_requests | jsonb | [{request, priority, feasibility}] |
| our_commitments | jsonb | [{what, by_when, owner, completed}] |
| client_commitments | jsonb | [{what, by_when, completed}] |
| open_questions | text[] | |
| key_quotes | jsonb | [{quote, context, importance}] |
| transcript_text | text | Full transcript (Hebrew) |
| handoff_notes | text | |
| context_for_next_call | text | |

**CRITICAL:** Transcriptions link to projects via `client_proposal_id`, NOT `project_id`.

**`project_members`** — Team assignments
| Column | Type | Notes |
|--------|------|-------|
| project_id | uuid | FK → projects |
| developer_id | bigint | FK → developers |
| role | text | lead, member |

**`developers`** — Team members
| Column | Type | Notes |
|--------|------|-------|
| id | bigint | PK |
| name | text | |
| email | text | |
| role | enum | admin, project_manager, senior_developer, developer, junior_developer, contractor |

**`project_resources`** — Documents, files, links
| Column | Type | Notes |
|--------|------|-------|
| project_id | uuid | FK → projects |
| resource_type | enum | |
| title | text | |
| content_json | jsonb | |
| file_url | text | |
| external_url | text | |

**`project_logs`** — Activity log
| Column | Type | Notes |
|--------|------|-------|
| project_id | uuid | FK → projects |
| action | text | task_created, task_updated, etc. |
| actor_id | int | Who did it |
| entity_type | text | task, project, etc. |
| metadata | jsonb | |

**`operational_knowledge`** — Reusable checklists, SOPs, skill references
| Column | Type | Notes |
|--------|------|-------|
| category | text | kickoff_checklist, skill_reference, process_template, sop, tool_reference |
| title | text | |
| content | jsonb | Category-specific content |
| applies_to | text[] | ['all'] or project types |

### Schema: `automaziot` (Proposals & Sales Context)

**`client_proposals`** — Full sales context for this client
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK — matches project.client_proposal_id |
| client_name | text | |
| company_name | text | |
| business_overview | jsonb | Industry, employees, main_challenge |
| goals_detailed | jsonb | primary_goal, secondary_goals, timeline |
| pain_points_detailed | jsonb | operational, technical, financial |
| current_systems | text[] | |
| technical_environment | jsonb | systems, integration_needs, constraints |
| current_process | jsonb | manual_steps, bottlenecks, tools_used |
| implementation_readiness | jsonb | urgency, blockers, budget |
| crm_context | jsonb | |
| whatsapp_context | jsonb | |
| ai_agents_requirements | jsonb | |
| existing_integrations | jsonb | payment, website, calendar |
| implementation_notes | jsonb | depends_on, challenges, responsibilities |
| recommended_solutions | jsonb | [{service, priority, reasoning}] |
| missing_information | text[] | |
| custom_items | jsonb | Base packages with scope details |
| internal_summary | text | |
| monthly_recurring_costs | text | |

### Schema: `public` (n8n Knowledge Base)

**`kb_workflows`** — 252 proven n8n workflow templates
**`kb_node_patterns`** — 823 working node configurations
**`kb_integration_usecases`** — 2,116 integration use cases
**`kb_connection_patterns`** — 516 node-to-node connection patterns

---

## Common Queries

```sql
-- Get this project's tasks
SELECT * FROM ongoing_clients_automaziot.project_tasks
WHERE project_id = 'd1ff9c3c-5030-4167-a54f-646185cc91de' ORDER BY task_number;

-- Get client systems and credentials
SELECT * FROM ongoing_clients_automaziot.client_systems
WHERE project_id = 'd1ff9c3c-5030-4167-a54f-646185cc91de';

-- Get transcription summaries (use client_proposal_id, NOT project_id)
SELECT ai_summary, key_points, key_decisions, action_items
FROM ongoing_clients_automaziot.transcriptions
WHERE client_proposal_id = '5c72507d-0f74-4aae-aedd-92d30eed1bbc';

-- Get full sales context
SELECT * FROM automaziot.client_proposals
WHERE id = '5c72507d-0f74-4aae-aedd-92d30eed1bbc';

-- Update task status when done
UPDATE ongoing_clients_automaziot.project_tasks
SET status = 'done', updated_at = now()
WHERE id = '<task_id>';

-- Save discovered credentials
UPDATE ongoing_clients_automaziot.client_systems
SET credentials = '<json>', status = 'active', updated_at = now()
WHERE id = '<system_id>';

-- Save deployed workflow URL
UPDATE ongoing_clients_automaziot.project_tasks
SET deployed_workflow_url = '<url>', updated_at = now()
WHERE id = '<task_id>';
```

**Always update Zonda when you complete tasks or discover credentials/URLs.**

---

## Available Skills

| Skill | When to Use |
|-------|-------------|
| `/automaziot-project-setup` | Setting up Railway infrastructure (Chatwoot, n8n, databases) |
| `/client-dashboard` | Building the client-facing dashboard |
| `/zonda-update` | Syncing progress back to Zonda via Supabase MCP |
| `/n8n-workflow-patterns` | Choosing architecture for n8n workflows |
| `/n8n-node-configuration` | Configuring specific n8n nodes |
| `/n8n-expression-syntax` | Writing n8n expressions |
| `/n8n-validation-expert` | Debugging n8n validation errors |
| `/n8n-code-javascript` | Writing JavaScript in n8n Code nodes |
| `/n8n-code-python` | Writing Python in n8n Code nodes |
| `/n8n-mcp-tools-expert` | Using n8n-mcp MCP tools |

---

## Development Workflow

### First Time Setup (MUST DO FIRST)

```bash
# Install required plugins
/plugin install automaziot-ai/superpowers-automaziot
/plugin install anthropics/claude-plugins-official
/plugin install wshobson/agents

# Set up environment variables
cp .env.example .env
# Fill in the values in .env
```

### Daily Workflow

1. **Read this file** to understand the project context
2. **Check tasks** in Supabase to see what's assigned to you
3. **Use skills** — they contain proven patterns for common operations
4. **Update Zonda** when completing tasks or discovering credentials
5. **Save to memory** anything important for future sessions

### Railway Infrastructure

Use `/automaziot-project-setup` skill for:
- Railway CLI authentication (referral: https://railway.com?referralCode=JYEBoq)
- Deploying Chatwoot, n8n, and databases
- Configuring environment variables and domains

### n8n Workflows

Use n8n skills and the n8n-kb MCP server for:
- Finding similar workflow patterns in the knowledge base
- Getting correct node configurations
- Validating workflows before deployment

---

## Conventions

- **WhatsApp:** Always through Chatwoot (never direct WhatsApp Cloud API)
- **Database:** Supabase unless client requires otherwise
- **Workflow platform:** n8n (deployed on Railway per client)
- **AI models:** Use OpenRouter for flexibility (client provides API key)
- **Credentials:** Never hardcode — use n8n credentials manager or env vars
- **Error handling:** Error Trigger node on every n8n workflow
- **Testing:** Test locally before deploying to production n8n
- **Language:** Client-facing content in Hebrew unless specified otherwise
- **Privacy:** Minimal data retention — delete sensitive data after processing

---

## Plugin & Skill Management

This project uses the **automaziot-skills** Claude Code plugin. Check operational_knowledge for latest recommendations:

```sql
SELECT * FROM ongoing_clients_automaziot.operational_knowledge
WHERE category = 'skill_reference' AND is_active = true;
```
