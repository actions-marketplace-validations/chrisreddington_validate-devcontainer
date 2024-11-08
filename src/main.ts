import * as core from '@actions/core'
import * as fs from 'fs'

interface VSCodeCustomizations {
  vscode: {
    extensions: string[]
  }
}

interface DevcontainerContent {
  customizations?: VSCodeCustomizations
  tasks?: {
    [key: string]: string
  }
  features?: {
    [key: string]: object
  }
}

function validateExtensions(
  devcontainerContent: DevcontainerContent,
  requiredExtensions: string[]
): string[] {
  const configuredExtensions =
    devcontainerContent?.customizations?.vscode?.extensions || []
  const missingExtensions = requiredExtensions.filter(
    required =>
      !configuredExtensions.some(
        configured => configured.toLowerCase() === required.toLowerCase()
      )
  )
  return missingExtensions
}

function validateTasks(
  devcontainerContent: DevcontainerContent
): string | null {
  const tasks = devcontainerContent.tasks
  if (!tasks) {
    return "'tasks' property is missing"
  }

  const requiredTasks = ['build', 'test', 'run']
  const missingTasks = requiredTasks.filter(
    task => !tasks[task] || typeof tasks[task] !== 'string'
  )

  if (missingTasks.length > 0) {
    return `Missing or invalid required tasks: ${missingTasks.join(', ')}`
  }

  return null
}

function validateFeatures(
  devcontainerContent: DevcontainerContent,
  requiredFeatures: string[]
): string[] {
  if (!requiredFeatures || requiredFeatures.length === 0) {
    return []
  }
  const configuredFeatures = devcontainerContent.features || {}
  const missingFeatures = requiredFeatures.filter(
    required => !(required in configuredFeatures)
  )
  return missingFeatures
}

// Add this type guard function before the run() function
function isDevcontainerContent(obj: unknown): obj is DevcontainerContent {
  if (typeof obj !== 'object' || obj === null) return false

  const candidate = obj as Partial<DevcontainerContent>

  if (candidate.customizations !== undefined) {
    if (
      typeof candidate.customizations !== 'object' ||
      !candidate.customizations.vscode?.extensions
    ) {
      return false
    }
    if (!Array.isArray(candidate.customizations.vscode.extensions)) {
      return false
    }
  }

  if (candidate.tasks !== undefined) {
    if (typeof candidate.tasks !== 'object') return false
    for (const [, value] of Object.entries(candidate.tasks)) {
      if (typeof value !== 'string') return false
    }
  }

  if (candidate.features !== undefined) {
    if (typeof candidate.features !== 'object') return false
    for (const [, value] of Object.entries(candidate.features)) {
      if (typeof value !== 'object') return false
    }
  }

  return true
}

// Add this helper function to strip comments
function stripJsonComments(jsonString: string): string {
  // Remove single line comments (// ...)
  return jsonString.replace(/\/\/.*$/gm, '')
}

export async function run(): Promise<void> {
  try {
    const extensionsList = core.getInput('extensions-list', { required: true })
    const devcontainerPath =
      core.getInput('devcontainer-path', { required: false }) ||
      '.devcontainer/devcontainer.json'
    const shouldValidateTasks = core.getInput('validate-tasks') === 'true'

    try {
      await fs.promises.access(devcontainerPath)
    } catch {
      throw new Error(`devcontainer.json not found at ${devcontainerPath}`)
    }

    // Update the JSON parse section with explicit type assertion
    const fileContent = await fs.promises.readFile(devcontainerPath, 'utf8')
    let parsedContent: unknown
    try {
      // Strip comments before parsing
      const cleanJson = stripJsonComments(fileContent)
      parsedContent = JSON.parse(cleanJson) as unknown
    } catch (error) {
      throw new Error(
        `Invalid JSON in devcontainer.json: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Strengthen type checking before using parsed content
    if (!isDevcontainerContent(parsedContent)) {
      throw new Error('Invalid devcontainer.json structure')
    }

    // Now parsedContent is safely typed as DevcontainerContent
    const devcontainerContent: DevcontainerContent = parsedContent

    const requiredExtensions = extensionsList.split(',').map(ext => ext.trim())
    const missingExtensions = validateExtensions(
      devcontainerContent,
      requiredExtensions
    )

    if (missingExtensions.length > 0) {
      throw new Error(
        `Missing required extensions: ${missingExtensions.join(', ')}`
      )
    }

    if (shouldValidateTasks) {
      const tasksError = validateTasks(devcontainerContent)
      if (tasksError) {
        throw new Error(tasksError)
      }
    }

    const featuresListInput = core.getInput('features-list', {
      required: false
    })
    if (featuresListInput) {
      const requiredFeatures = featuresListInput
        .split(',')
        .map(feature => feature.trim())
      const missingFeatures = validateFeatures(
        devcontainerContent,
        requiredFeatures
      )

      if (missingFeatures.length > 0) {
        throw new Error(
          `Missing required features: ${missingFeatures.join(', ')}`
        )
      }
    }

    core.info('All validations passed successfully')
  } catch (error: unknown) {
    let errorMessage: string
    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    } else {
      errorMessage = 'An unknown error occurred'
    }
    core.setFailed(errorMessage)
  }
}

export {
  validateExtensions,
  validateTasks,
  validateFeatures,
  DevcontainerContent,
  VSCodeCustomizations
}
