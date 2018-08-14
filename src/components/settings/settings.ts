import BlockstackUtils from '../../util/blockstackUtils'
import { html, render } from '../../../node_modules/lit-html/lib/lit-extended'
import  * as settings from '../../settings'

import { createWebTaskTask, createCronSchedule } from '../../util/webtask';
import { loadSettings, Settings } from '../../settings'
import Store from '../../store'

interface SettingViewModel {
  key: string
  value: string
  readonly: boolean
  label: string
  helpText: string
  type: "text" | "number" | "email"
  deployedVersionPromise: Promise<string>
  githubVersionPromise: Promise<string>
  required: boolean
}

type tuple = [keyof Settings, boolean]

function sendReports() {
  fetch(settings.getValue('statsTaskUrl')).then(console.log)
}

export const codeBases = <{readonly[k: string]: string}>{
  hostingTaskUrl:   'https://raw.githubusercontent.com/FoundersAS/dappform-tasks-form-hosting/master/package.json',
  submissionTaskUrl:'https://raw.githubusercontent.com/FoundersAS/dappform-tasks-submissions/master/package.json',
  statsTaskUrl:     'https://raw.githubusercontent.com/FoundersAS/dappform-tasks-stats/master/package.json',
}

async function deployTasks() {
  settings.setValue('hostingTaskUrl', (await createWebTaskTask(
    'dappform-tasks-host',
    "https://raw.githubusercontent.com/FoundersAS/dappform-tasks-form-hosting/master/main.js",
    "https://raw.githubusercontent.com/FoundersAS/dappform-tasks-form-hosting/master/package.json",
    {
    }
  )).webtask_url)

  settings.setValue('submissionTaskUrl', (await createWebTaskTask(
    'dappform-tasks-submission',
    'https://raw.githubusercontent.com/FoundersAS/dappform-tasks-submissions/master/index.js',
    'https://raw.githubusercontent.com/FoundersAS/dappform-tasks-submissions/master/package.json',
    {...BlockstackUtils.getBlockstackLocalStorage(),
      BLOCKSTACK_APP_PRIVATE_KEY: new BlockstackUtils().privateKey},
  )).webtask_url)

  settings.setValue('statsTaskUrl', (await createWebTaskTask(
    'dappform-tasks-stats',
    'https://raw.githubusercontent.com/FoundersAS/dappform-tasks-stats/master/index.js',
    'https://raw.githubusercontent.com/FoundersAS/dappform-tasks-stats/master/package.json',
    { ... BlockstackUtils.getBlockstackLocalStorage(),
      POSTMARK_TOKEN: settings.getValue('postmarkToken'),
      POSTMARK_FROM: settings.getValue('postmarkFrom'),
      POSTMARK_TO: settings.getValue('email')
    }
  )).webtask_url)

  await createCronSchedule('dappform-tasks-stats', settings.getValue('cronSchedule'))
  await settings.saveSettings()
  update()
}

async function saveUserDefinedSettings() {
  Object.entries(settings.settingsSchema)
    .filter(([key, readonly]:tuple) => !readonly)
    .forEach(([key]:tuple) => {
      settings.setValue(key, (document.querySelector(`[name=${key}]`) as HTMLInputElement).value)
  })

  await settings.saveSettings()
  update()
}

export async function update() {
  console.log("update()")
  const el = document.querySelector('settings-view')
  let helpText:string
  if (!Store.store.settingsLoaded) {
    await loadSettings()
  }
  const rows:SettingViewModel[] = Object.entries(settings.settingsSchema).map(([key, readonly]:tuple) => {
    let deployedVersionPromise:Promise<string|void>
    let githubVersionPromise:Promise<string|void>

    const lookupVersionForKey = readonly // it just so happens that the read-only keys are all web tasks
    if (settings.getValue(key) && lookupVersionForKey) {
      const url = new URL(settings.getValue(key))
      url.pathname = `${url.pathname}/package.json`
      deployedVersionPromise = fetch(url.toString())
        .then(res => (res.status < 300) ? res.json() : Promise.reject("Status not 200 for "+ res.url))
        .then(packageJson => (typeof packageJson === "object") ? `Version ${packageJson.version}` : "package.json not valid")
        .catch(reason => console.warn("Getting deployed version failed. ", reason))

      githubVersionPromise = fetch(codeBases[key])
        .then(res => (res.status < 300) ? res.json() : Promise.reject("Status not 200"))
        .then(packageJson => (typeof packageJson === "object") ? `Latest ${packageJson.version}` : "package.json not valid")
        .catch(reason => console.warn("Getting latest version failed. ", reason))
    }

    const value = settings.getValue(key)
    const type = key.includes("email") ? "email" : "text"
    const required = false

    return <SettingViewModel>{
      type,
      readonly,
      key,
      value,
      helpText,
      deployedVersionPromise,
      githubVersionPromise,
      required,
    }
  })

  const tpl = html`
    <h3>Settings</h3>

    <div class="grid-x grid-margin-y">
      <div class="cell medium-12">
        <button class="button" on-click="${saveUserDefinedSettings}">Save</button>
        <button class="button success" on-click="${deployTasks}">Deploy Tasks</button>
        <button class="button success" on-click="${sendReports}">Send Reports</button>
      </div>
      
      <form class="grid-x grid-margin-x grid-margin-y">
        ${rows.map((vm) => html`            
          <div class="cell medium-6">
            <label>
              ${vm.key}
              <input type="${vm.type}" name="${vm.key}" value="${vm.value}" readonly?=${vm.readonly} required?=${vm.readonly}>
            </label>
            <p class="help-text">${vm.helpText} ${vm.deployedVersionPromise} ${vm.githubVersionPromise}</p>
          </div>
        `)}
      </form>
    </div>
  `
  render(tpl, el)
}
