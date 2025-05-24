#!/usr/bin/env node
// BGP Policy Template CLI
// Command-line interface for policy template management

import { Command } from 'commander'
import chalk from 'chalk'
import inquirer from 'inquirer'
import { table } from 'table'
import {
  getAllPolicyTemplates,
  getPolicyTemplatesByCategory,
  getPolicyTemplate,
  searchPolicyTemplates,
  applyPolicyTemplate,
  getPolicyTemplateStats,
  PolicyTemplateCategory,
} from '../bgp/policy-templates.js'
import { PolicyEngine, PolicyConfig } from '../bgp/policy.js'
import { AgentRoute } from '../bgp/types.js'
import { writeFileSync, readFileSync, existsSync } from 'fs'

/**
 * Template Application Options
 */
interface ApplyOptions {
  output?: string
  interactive?: boolean
  enabledOnly?: boolean
  priorityOffset?: number
  namePrefix?: string
  testFile?: string
  validate?: boolean
}

/**
 * Initialize CLI program
 */
function createCLI(): Command {
  const program = new Command()

  program
    .name('bgp-policy-templates')
    .description('BGP Policy Template Management CLI')
    .version('1.0.0')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-i, --interactive', 'Enable interactive mode', false)

  return program
}

/**
 * List all available policy templates
 */
function listTemplatesCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List available policy templates')
    .option('-c, --category <category>', 'Filter by category')
    .option('-d, --difficulty <difficulty>', 'Filter by difficulty')
    .option('-t, --tag <tag>', 'Filter by tag')
    .option('--detailed', 'Show detailed information', false)
    .action(
      (options: {
        category?: string
        difficulty?: string
        tag?: string
        detailed?: boolean
      }) => {
        console.log(chalk.blue.bold('📚 BGP Policy Templates\n'))

        let templates = getAllPolicyTemplates()

        // Apply filters
        if (options.category) {
          templates = getPolicyTemplatesByCategory(
            options.category as PolicyTemplateCategory,
          )
        }

        if (options.difficulty) {
          templates = templates.filter(
            (t) => t.difficulty === options.difficulty,
          )
        }

        if (options.tag) {
          templates = templates.filter((t) => t.tags.includes(options.tag!))
        }

        if (templates.length === 0) {
          console.log(chalk.yellow('No templates found matching criteria.'))
          return
        }

        if (options.detailed) {
          // Detailed view
          templates.forEach((template) => {
            console.log(chalk.cyan.bold(`🎯 ${template.name}`))
            console.log(chalk.gray(`   ID: ${template.id}`))
            console.log(chalk.gray(`   Category: ${template.category}`))
            console.log(chalk.gray(`   Difficulty: ${template.difficulty}`))
            console.log(chalk.gray(`   Policies: ${template.policies.length}`))
            console.log(chalk.gray(`   Tags: ${template.tags.join(', ')}`))
            console.log(chalk.white(`   Description: ${template.description}`))
            console.log(chalk.white(`   Use Case: ${template.useCase}`))
            console.log()
          })
        } else {
          // Table view
          const tableData = [
            [
              chalk.bold('ID'),
              chalk.bold('Name'),
              chalk.bold('Category'),
              chalk.bold('Difficulty'),
              chalk.bold('Policies'),
            ],
            ...templates.map((template) => [
              template.id,
              template.name,
              template.category,
              template.difficulty,
              template.policies.length.toString(),
            ]),
          ]

          console.log(table(tableData))
        }

        console.log(
          chalk.green(
            `\n✅ Found ${templates.length} template${templates.length === 1 ? '' : 's'}`,
          ),
        )
      },
    )
}

/**
 * Show detailed information about a specific template
 */
function showTemplateCommand(program: Command): void {
  program
    .command('show <templateId>')
    .description('Show detailed information about a template')
    .option('--policies', 'Show individual policies', false)
    .action((templateId: string, options: { policies?: boolean }) => {
      const template = getPolicyTemplate(templateId)

      if (!template) {
        console.log(chalk.red(`❌ Template '${templateId}' not found`))
        process.exit(1)
      }

      console.log(chalk.blue.bold(`📋 Template: ${template.name}\n`))

      console.log(chalk.cyan.bold('📖 Information:'))
      console.log(`   ID: ${template.id}`)
      console.log(`   Category: ${template.category}`)
      console.log(`   Difficulty: ${template.difficulty}`)
      console.log(`   Policies: ${template.policies.length}`)
      console.log(`   Tags: ${template.tags.join(', ')}`)
      console.log()

      console.log(chalk.cyan.bold('📝 Description:'))
      console.log(template.description)
      console.log()

      console.log(chalk.cyan.bold('🎯 Use Case:'))
      console.log(template.useCase)
      console.log()

      if (options.policies) {
        console.log(chalk.cyan.bold('⚙️ Policies:'))
        template.policies.forEach((policy, index) => {
          console.log(
            chalk.white(
              `   ${index + 1}. ${policy.name} (priority: ${policy.priority})`,
            ),
          )
          console.log(chalk.gray(`      ${policy.description}`))
          console.log(
            chalk.gray(
              `      Action: ${policy.action.action} | Enabled: ${policy.enabled}`,
            ),
          )
        })
        console.log()
      }

      if (template.documentation) {
        console.log(chalk.cyan.bold('📚 Documentation:'))
        console.log(template.documentation)
      }
    })
}

/**
 * Search templates by keyword
 */
function searchTemplatesCommand(program: Command): void {
  program
    .command('search <keyword>')
    .description('Search templates by keyword')
    .option('--detailed', 'Show detailed results', false)
    .action((keyword: string, options: { detailed?: boolean }) => {
      console.log(chalk.blue.bold(`🔍 Searching for: "${keyword}"\n`))

      const templates = searchPolicyTemplates(keyword)

      if (templates.length === 0) {
        console.log(chalk.yellow(`No templates found matching "${keyword}"`))
        console.log(chalk.gray('Try searching for:'))
        console.log(chalk.gray('  - security, performance, reliability'))
        console.log(chalk.gray('  - development, production'))
        console.log(chalk.gray('  - health, routing, policy'))
        return
      }

      if (options.detailed) {
        templates.forEach((template) => {
          console.log(chalk.cyan.bold(`🎯 ${template.name}`))
          console.log(chalk.gray(`   ID: ${template.id}`))
          console.log(chalk.white(`   ${template.description}`))
          console.log()
        })
      } else {
        const tableData = [
          [chalk.bold('ID'), chalk.bold('Name'), chalk.bold('Category')],
          ...templates.map((template) => [
            template.id,
            template.name,
            template.category,
          ]),
        ]

        console.log(table(tableData))
      }

      console.log(
        chalk.green(
          `\n✅ Found ${templates.length} template${templates.length === 1 ? '' : 's'} matching "${keyword}"`,
        ),
      )
    })
}

/**
 * Apply a policy template
 */
function applyTemplateCommand(program: Command): void {
  program
    .command('apply <templateId>')
    .description('Apply a policy template')
    .option('-o, --output <file>', 'Output file for generated policies')
    .option('-i, --interactive', 'Interactive customization', false)
    .option('--enabled-only', 'Include only enabled policies', false)
    .option('--priority-offset <number>', 'Priority offset for policies')
    .option('--name-prefix <prefix>', 'Prefix for policy names')
    .option('--test-file <file>', 'Test against routes from file')
    .option('--validate', 'Validate generated policies', false)
    .action(async (templateId: string, options: ApplyOptions) => {
      console.log(chalk.blue.bold(`⚡ Applying template: ${templateId}\n`))

      const template = getPolicyTemplate(templateId)

      if (!template) {
        console.log(chalk.red(`❌ Template '${templateId}' not found`))
        process.exit(1)
      }

      let customization = {
        enabledOnly: options.enabledOnly,
        priorityOffset: options.priorityOffset
          ? parseInt(options.priorityOffset.toString())
          : undefined,
        namePrefix: options.namePrefix,
      }

      // Interactive customization
      if (options.interactive) {
        console.log(chalk.cyan('🔧 Interactive Customization\n'))

        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'enabledOnly',
            message: 'Include only enabled policies?',
            default: customization.enabledOnly || false,
          },
          {
            type: 'number',
            name: 'priorityOffset',
            message: 'Priority offset (0 for no change):',
            default: customization.priorityOffset || 0,
          },
          {
            type: 'input',
            name: 'namePrefix',
            message: 'Policy name prefix:',
            default: customization.namePrefix || '',
          },
        ])

        customization = { ...customization, ...answers }
      }

      try {
        // Apply template
        const policies = applyPolicyTemplate(templateId, customization)

        console.log(
          chalk.green(`✅ Generated ${policies.length} policies from template`),
        )

        // Validation
        if (options.validate) {
          console.log(chalk.cyan('\n🔍 Validating policies...'))
          const policyEngine = new PolicyEngine()

          let validPolicies = 0
          for (const policy of policies) {
            if (policyEngine.addPolicy(policy)) {
              validPolicies++
            }
          }

          if (validPolicies === policies.length) {
            console.log(chalk.green('✅ All policies are valid'))
          } else {
            console.log(
              chalk.yellow(
                `⚠️ ${validPolicies}/${policies.length} policies are valid`,
              ),
            )
          }
        }

        // Test against routes
        if (options.testFile) {
          console.log(chalk.cyan('\n🧪 Testing against sample routes...'))
          await testPoliciesAgainstRoutes(policies, options.testFile)
        }

        // Output to file
        if (options.output) {
          const outputData = {
            template: {
              id: template.id,
              name: template.name,
              appliedAt: new Date().toISOString(),
            },
            customization,
            policies,
          }

          writeFileSync(options.output, JSON.stringify(outputData, null, 2))
          console.log(chalk.green(`💾 Policies saved to: ${options.output}`))
        } else {
          // Print to console
          console.log(chalk.cyan('\n📋 Generated Policies:'))
          policies.forEach((policy, index) => {
            console.log(
              chalk.white(
                `   ${index + 1}. ${policy.name} (priority: ${policy.priority})`,
              ),
            )
          })
        }
      } catch (error) {
        console.log(
          chalk.red(
            `❌ Failed to apply template: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ),
        )
        process.exit(1)
      }
    })
}

/**
 * Show template statistics
 */
function statsCommand(program: Command): void {
  program
    .command('stats')
    .description('Show policy template statistics')
    .action(() => {
      console.log(chalk.blue.bold('📊 Policy Template Statistics\n'))

      const stats = getPolicyTemplateStats()

      console.log(chalk.cyan.bold('📈 Overview:'))
      console.log(`   Total Templates: ${stats.totalTemplates}`)
      console.log(`   Total Policies: ${stats.totalPolicies}`)
      console.log()

      console.log(chalk.cyan.bold('📚 By Category:'))
      Object.entries(stats.categoryCounts).forEach(([category, count]) => {
        console.log(`   ${category}: ${count}`)
      })
      console.log()

      console.log(chalk.cyan.bold('🎯 By Difficulty:'))
      Object.entries(stats.difficultyCounts).forEach(([difficulty, count]) => {
        console.log(`   ${difficulty}: ${count}`)
      })
    })
}

/**
 * Interactive template wizard
 */
function wizardCommand(program: Command): void {
  program
    .command('wizard')
    .description('Interactive template selection wizard')
    .action(async () => {
      console.log(chalk.blue.bold('🧙 Policy Template Wizard\n'))

      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'scenario',
          message: 'What is your primary use case?',
          choices: [
            {
              name: '🔒 Security - Protect against threats',
              value: 'security',
            },
            {
              name: '⚡ Performance - Optimize speed and latency',
              value: 'performance',
            },
            {
              name: '🛡️ Reliability - Ensure high availability',
              value: 'reliability',
            },
            {
              name: '🧪 Development - Testing and debugging',
              value: 'development',
            },
            {
              name: '🏭 Production - Enterprise deployment',
              value: 'production',
            },
          ],
        },
        {
          type: 'list',
          name: 'difficulty',
          message: 'What is your experience level?',
          choices: [
            { name: '🌱 Beginner - New to BGP policies', value: 'beginner' },
            {
              name: '🔧 Intermediate - Some BGP experience',
              value: 'intermediate',
            },
            { name: '🚀 Advanced - Expert user', value: 'advanced' },
          ],
        },
      ])

      const templates = getAllPolicyTemplates().filter(
        (t) =>
          t.category === answers.scenario &&
          t.difficulty === answers.difficulty,
      )

      if (templates.length === 0) {
        console.log(chalk.yellow('\n⚠️ No templates found for your criteria.'))
        console.log(
          chalk.gray(
            'Try browsing all templates with: bgp-policy-templates list',
          ),
        )
        return
      }

      console.log(chalk.cyan(`\n🎯 Recommended Templates:\n`))

      const templateChoice = await inquirer.prompt([
        {
          type: 'list',
          name: 'templateId',
          message: 'Select a template to apply:',
          choices: templates.map((t) => ({
            name: `${t.name} - ${t.description}`,
            value: t.id,
          })),
        },
      ])

      const applyChoice = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'apply',
          message: 'Apply this template now?',
          default: true,
        },
      ])

      if (applyChoice.apply) {
        // Apply template with interactive mode
        console.log(
          chalk.green('\n✅ Applying template with wizard settings...'),
        )
        // This would call the apply command with interactive mode
        // For now, show the command that would be run
        console.log(
          chalk.gray(
            `Command: bgp-policy-templates apply ${templateChoice.templateId} --interactive`,
          ),
        )
      } else {
        console.log(
          chalk.gray(
            `\nTo apply later: bgp-policy-templates apply ${templateChoice.templateId}`,
          ),
        )
      }
    })
}

/**
 * Test policies against sample routes
 */
async function testPoliciesAgainstRoutes(
  policies: PolicyConfig[],
  routeFile: string,
): Promise<void> {
  try {
    if (!existsSync(routeFile)) {
      console.log(chalk.red(`❌ Route file not found: ${routeFile}`))
      return
    }

    const routeData = JSON.parse(readFileSync(routeFile, 'utf8'))
    const routes: AgentRoute[] = Array.isArray(routeData)
      ? routeData
      : routeData.routes || []

    if (routes.length === 0) {
      console.log(chalk.yellow('⚠️ No routes found in test file'))
      return
    }

    const policyEngine = new PolicyEngine()
    for (const policy of policies) {
      policyEngine.addPolicy(policy)
    }

    const acceptedRoutes = policyEngine.applyPolicies(routes)
    const rejectedCount = routes.length - acceptedRoutes.length

    console.log(
      chalk.green(
        `   ✅ ${acceptedRoutes.length}/${routes.length} routes accepted`,
      ),
    )
    console.log(chalk.red(`   ❌ ${rejectedCount} routes rejected`))

    if (acceptedRoutes.length > 0) {
      console.log(chalk.cyan('   📋 Accepted agents:'))
      acceptedRoutes.slice(0, 5).forEach((route) => {
        console.log(chalk.gray(`      - ${route.agentId}`))
      })
      if (acceptedRoutes.length > 5) {
        console.log(
          chalk.gray(`      ... and ${acceptedRoutes.length - 5} more`),
        )
      }
    }
  } catch (error) {
    console.log(
      chalk.red(
        `❌ Failed to test routes: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ),
    )
  }
}

/**
 * Main CLI entry point
 */
export function main(): void {
  const program = createCLI()

  // Add commands
  listTemplatesCommand(program)
  showTemplateCommand(program)
  searchTemplatesCommand(program)
  applyTemplateCommand(program)
  statsCommand(program)
  wizardCommand(program)

  // Parse command line arguments
  program.parse()
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
