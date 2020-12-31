import { generateSeed } from './iota/generate.js'
import { MamReader, MamWriter } from './iota/mam_gate.js'
import { Message, Security } from '../src/simulation/constants.js'
import { SecurityToolBox } from './iota/security.js'
import { Seed, MamSettings } from './simulation/constants'

let agentsChannels = []
let diagnostChannels = []

window.onload = () => {
    var canvas = document.getElementById('scene')
    var toggle = document.getElementById('toggle')
    var solver = document.getElementById('solver')

    // Stretch the canvas to the window size
    canvas.width = window.innerWidth, - 30
    canvas.height = window.innerHeight - 30

    var webgl = new Worker('./webgl_worker.bundle.js')
    var geosolver = new Worker('./geosolver.bundle.js')
    var offscreen = canvas.transferControlToOffscreen()

    // Start WebGL worker
    webgl.postMessage({
        message: Message.startWebGLWorker,
        canvas: offscreen,
        width: window.innerWidth,
        height: window.innerHeight,
        offsetLeft: canvas.offsetLeft,
        offsetTop: canvas.offsetTop
    }, [offscreen])

    // Play/Pause event listener
    toggle.addEventListener('click', _ => {
        if (toggle.innerText == 'Pause') {
            toggle.innerText = 'Play'
            webgl.postMessage({message: Message.pauseResume})
        } else {
            toggle.innerText = 'Pause'
            webgl.postMessage({message: Message.pauseResume})
        }
    })

    // Add event listener to select agents
    canvas.addEventListener('click', event => {
        webgl.postMessage({
            message: Message.click, 
            clientX: event.clientX, 
            clientY: event.clientY
        })
    }, false)

    solver.addEventListener('click', _ => {
        webgl.postMessage({
            message: Message.getSimulationDateForSolver
        })
    })

    // GUI worker
    webgl.onmessage = event => {
        const data = event.data
        console.log('From WebGL to Main:', data)
        if (data.message == Message.initMamChannels) { 
            initializeMamChannels(data.agentsNumber, data.diagnostNumber)
            geosolver.postMessage({
                message: Message.initAgentsChannels,
                agentsSeeds: agentsChannels.map(c => c.mam.getSeed()),
                diagnosticiansSeeds: diagnostChannels.map(c => c.mam.getSeed())
            })
        } else if (data.message == Message.agentWriteOnMam) { 
            agentWriteOnMam(data.agentIndex, data.agent) 
        } else if (data.message == Message.diagnosticianWriteOnMam) { 
            diagnosticianWriteOnMam(data.agent, data.agentIndex, data.diagnosticianIndex) 
        } else if (data.message == Message.returnSimulationDateForSolver) {
            geosolver.postMessage({
                message: Message.calculatePossibleInfections,
                currentDate: data.currentDate
            })
        } else {
            throw new Error('Illegal message from Web Worker to Main')
        }
    }

    // Geosolver worker
    geosolver.onmessage = event => {
        console.log('From Geosolver to Main:', event.data)
        if (event.data.message == Message.triggerAgents) {
            agentsChannels.forEach(async (a, i) => {
                let previousRoot = a.notifications.currentRoot
                const payloads = await a.notifications.read()
                const possible = [...new Set(
                    payloads.flatMap(p => {
                        const c = p.checksum
			            if (SecurityToolBox.verifyMessage(c.cyphertext, c.signature, c.key)) {
                            return p.possible
                        } else {
                            console.log('CHECKSUM ERROR:', previousRoot)
                            return []
                        }
                    })
                )]
                webgl.postMessage({
                    message: Message.checkNotifications,
                    index: i,
                    possible: possible
                })
            })
        } else {
            throw new Error('Illegal message from Geosolver to Main')
        }
    }
}

function initializeMamChannels(agentsNumber, diagnostNumber) {
    // Agents' mam channels initialization
    for (const i of Array(agentsNumber).keys()) {
        agentsChannels.push({
            mam: new MamWriter(
                MamSettings.provider, generateSeed(Seed.appId + "-sim" + Seed.simId + '-' + Seed.agentId + i)
            ),
            notifications: new MamReader(MamSettings.provider, Security.geosolverSeed),
            security: new SecurityToolBox()
        })
    }
    for (const i of Array(diagnostNumber).keys()) {
        diagnostChannels.push({
            mam: new MamWriter(
                MamSettings.provider, generateSeed(Seed.appId + "-sim" + Seed.simId + '-' + Seed.diagnostId + i)
            ),
            security: new SecurityToolBox()
        })
    }
    console.log('AGENTS\' ROOTS:', agentsChannels.map(c => c.mam.startRoot))
    console.log('DIAGNOSTICIANS\' ROOTS:', diagnostChannels.map(c => c.mam.startRoot))
}

async function agentWriteOnMam(agentIndex, agent) {
    let cyphertext = agentsChannels[agentIndex].security.encryptMessage(
        'checksum', agentsChannels[agentIndex].security.keys.publicKey
    )
    // Agent writing on Mam
    await agentsChannels[agentIndex].mam.publish({
        id: agent.id,
        agentPublicKey: agentsChannels[agentIndex].security.keys.publicKey,
        history: agentsChannels[agentIndex].security.encryptMessage(
            JSON.stringify(agent.history),
            Security.geosolverPublicKey
        ),
        checksum: {
            cyphertext: cyphertext,
            signature: agentsChannels[agentIndex].security.signMessage(cyphertext),
            key: agentsChannels[agentIndex].security.keys.publicKey,
        },
    })
}

async function diagnosticianWriteOnMam(agent, agentIndex, diagnosticianIndex) {
    // Agent publishes cached history
    await agentWriteOnMam(agentIndex, agent)
    // Diagnostician reads agents' transactions from their mam channel
    let mam = new MamReader(MamSettings.provider, agentsChannels[agentIndex].mam.getSeed())
    let payloads = await mam.read()
    let cyphertext = diagnostChannels[diagnosticianIndex].security.encryptMessage(
        'checksum', diagnostChannels[diagnosticianIndex].security.keys.publicKey
    )
    // Diagnostician writes single transaction with all the data without the id
    diagnostChannels[diagnosticianIndex].mam.publish({
        bundle: payloads.map(p => p.history),
        agentPublicKey: agentsChannels[agentIndex].security.keys.publicKey,
        checksum: {
            cyphertext: cyphertext,
            signature: diagnostChannels[diagnosticianIndex].security.signMessage(cyphertext),
            key: diagnostChannels[diagnosticianIndex].security.keys.publicKey
        }
    })
}
