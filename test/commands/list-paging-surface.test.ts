 
import {expect} from 'chai'

import BranchList from '../../src/commands/branch/list/index.js'
import EphemeralList from '../../src/commands/ephemeral/list/index.js'
import EphemeralStaticHostBuildList from '../../src/commands/ephemeral/static_host/build/list/index.js'
import EphemeralStaticHostList from '../../src/commands/ephemeral/static_host/list/index.js'
import FunctionList from '../../src/commands/function/list/index.js'
import KnowledgeList from '../../src/commands/knowledge/list/index.js'
import PlatformList from '../../src/commands/platform/list/index.js'
import ReleaseList from '../../src/commands/release/list/index.js'
import SandboxEnvList from '../../src/commands/sandbox/env/list/index.js'
import SandboxUnitTestList from '../../src/commands/sandbox/unit_test/list/index.js'
import SandboxWorkflowTestList from '../../src/commands/sandbox/workflow_test/list/index.js'
import StaticHostBuildList from '../../src/commands/static_host/build/list/index.js'
import StaticHostList from '../../src/commands/static_host/list/index.js'
import TenantBackupList from '../../src/commands/tenant/backup/list/index.js'
import TenantClusterList from '../../src/commands/tenant/cluster/list/index.js'
import TenantEnvList from '../../src/commands/tenant/env/list/index.js'
import TenantList from '../../src/commands/tenant/list/index.js'
import TenantSnapshotList from '../../src/commands/tenant/snapshot/list/index.js'
import TenantUnitTestList from '../../src/commands/tenant/unit_test/list/index.js'
import TenantWorkflowTestList from '../../src/commands/tenant/workflow_test/list/index.js'
import UnitTestList from '../../src/commands/unit_test/list/index.js'
import WorkflowTestList from '../../src/commands/workflow_test/list/index.js'
import WorkspaceList from '../../src/commands/workspace/list/index.js'

/**
 * Guards the paging tier each list command belongs to.
 *
 * The Metadata API pages unevenly and these boundaries are easy to erode by
 * copy-pasting a flag block from a neighbouring command. Each assertion below
 * encodes a decision about what the backing endpoint actually supports.
 */
const flagsOf = (cmd: {flags: Record<string, unknown>}): string[] => Object.keys(cmd.flags)

describe('list command paging surface', () => {
  describe('envelope tier — endpoint returns curPage/nextPage', () => {
    const envelopeCommands: Array<[string, {flags: Record<string, unknown>}]> = [
      ['function list', FunctionList],
      ['unit_test list', UnitTestList],
      ['workflow_test list', WorkflowTestList],
      ['sandbox unit_test list', SandboxUnitTestList],
      ['sandbox workflow_test list', SandboxWorkflowTestList],
      ['tenant unit_test list', TenantUnitTestList],
      ['tenant workflow_test list', TenantWorkflowTestList],
    ]

    for (const [name, cmd] of envelopeCommands) {
      it(`${name} exposes both page and per_page`, () => {
        expect(flagsOf(cmd)).to.include.members(['page', 'per_page'])
      })
    }

    const testListCommands: Array<[string, {flags: Record<string, unknown>}]> = [
      ['unit_test list', UnitTestList],
      ['workflow_test list', WorkflowTestList],
      ['sandbox unit_test list', SandboxUnitTestList],
      ['sandbox workflow_test list', SandboxWorkflowTestList],
      ['tenant unit_test list', TenantUnitTestList],
      ['tenant workflow_test list', TenantWorkflowTestList],
    ]

    for (const [name, cmd] of testListCommands) {
      it(`${name} defaults per_page to 50`, () => {
        // These commands used to request per_page=10000 internally so nothing
        // was ever cut off. Now that the footer and the JSON envelope both
        // report position, a page that stops at 50 is visible rather than
        // silent, so the ordinary default applies.
        const perPage = cmd.flags.per_page as {default?: number}
        expect(perPage.default).to.equal(50)
      })
    }

    it('function list keeps its long-standing default of 50', () => {
      const perPage = FunctionList.flags.per_page as {default?: number}
      expect(perPage.default).to.equal(50)
    })
  })

  describe('page-only-envelope tier — endpoint hardcodes per_page server-side', () => {
    it('static_host list exposes page but not per_page', () => {
      expect(flagsOf(StaticHostList)).to.include('page')
      expect(flagsOf(StaticHostList)).to.not.include('per_page')
    })

    it('static_host build list exposes page but not per_page', () => {
      expect(flagsOf(StaticHostBuildList)).to.not.include('per_page')
    })

    it('ephemeral static_host list exposes page but not per_page', () => {
      expect(flagsOf(EphemeralStaticHostList)).to.not.include('per_page')
    })

    it('ephemeral static_host build list exposes page but not per_page', () => {
      expect(flagsOf(EphemeralStaticHostBuildList)).to.include('page')
      expect(flagsOf(EphemeralStaticHostBuildList)).to.not.include('per_page')
    })

    it('documents the server-fixed page size on the page flag', () => {
      const page = StaticHostList.flags.page as {description?: string}
      expect(page.description).to.contain('100')
    })
  })

  describe('bare-array endpoints stay unpaged', () => {
    // These endpoints accept page/per_page but return no paging metadata, so the
    // CLI cannot describe position. Offering flags would mean inferring
    // has-more from page fullness, which is a guaranteed false positive when the
    // result set is an exact multiple of the page size.
    const bareArray: Array<[string, {flags: Record<string, unknown>}]> = [
      ['tenant list', TenantList],
      ['release list', ReleaseList],
      ['platform list', PlatformList],
      ['tenant cluster list', TenantClusterList],
      ['ephemeral list', EphemeralList],
    ]

    for (const [name, cmd] of bareArray) {
      it(`${name} exposes no paging flags`, () => {
        expect(flagsOf(cmd)).to.not.include('page')
        expect(flagsOf(cmd)).to.not.include('per_page')
      })
    }

    it('tenant backup list keeps its pre-existing --page but gains no per_page', () => {
      // This command already shipped --page before the paging work; it is left
      // exactly as-is rather than being promoted to a paging tier.
      expect(flagsOf(TenantBackupList)).to.include('page')
      expect(flagsOf(TenantBackupList)).to.not.include('per_page')
    })
  })

  describe('none tier — endpoint has no paging at all', () => {
    const unpaged: Array<[string, {flags: Record<string, unknown>}]> = [
      ['branch list', BranchList],
      ['workspace list', WorkspaceList],
      ['knowledge list', KnowledgeList],
      ['tenant snapshot list', TenantSnapshotList],
      ['sandbox env list', SandboxEnvList],
      ['tenant env list', TenantEnvList],
    ]

    for (const [name, cmd] of unpaged) {
      it(`${name} exposes no paging flags`, () => {
        expect(flagsOf(cmd)).to.not.include('page')
        expect(flagsOf(cmd)).to.not.include('per_page')
      })
    }
  })
})
