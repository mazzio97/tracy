import { Colors, Dim, Probabilities, Time } from './constants.js'
import { generateSeed } from '../iota/generate.js'
import { MamGate } from '../iota/mam_gate.js'
import { SecurityToolBox } from '../iota/security.js'

class Agent {
    constructor(name, home, covidCentre, tag, initialState = State.NORMAL, medicalStatus = new MedicalStatus()) {
        this.name = name
        this.home = home
        this.x = home.getRandomX()
        this.y = home.getRandomY()
        this.covidCentre = covidCentre
        this.targetX = undefined
        this.targetY = undefined
        this.state = initialState
        this.medicalStatus = medicalStatus
        this.selected = false
        this.lastWriting = undefined
        this.channel = new MamGate('public', 'https://nodes.devnet.iota.org', generateSeed(), tag)
        this.secutityToolbox = new SecurityToolBox()
        this.geosolverPublicKey = 'uhayO4JgKQ8SPZqg1xReY3USXTm1OrF3F8VzOfht1TE='
    }

    move(targetX, targetY) {
        this.targetX = targetX
        this.targetY = targetY
    }

    readNotification() {
        // TODO: read notification blockchain
        this.state = State.NOTIFIED
        this.move(this.covidCentre.getRandomX(), this.covidCentre.getRandomY())
    }

    writeMessage(date) {
        if (this.lastWriting == undefined || date - this.lastWriting >= Time.writingTime) {
            this.lastWriting = new Date(date)
            this.channel.publish({
                message: this.secutityToolbox.encryptMessage(this.name, 
                    this.secutityToolbox.keys.publicKey),
                x: this.secutityToolbox.encryptMessage(JSON.stringify(this.x), 
                    this.geosolverPublicKey),
                y: this.secutityToolbox.encryptMessage(JSON.stringify(this.y), 
                    this.geosolverPublicKey),
                date: this.secutityToolbox.encryptMessage(JSON.stringify(this.lastWriting), 
                    this.geosolverPublicKey),
                publicKey: this.secutityToolbox.keys.publicKey
            })
        }
    }

    updatePosition(places, date) {
        // If targetX is present, the agent moves towards the target
        // Otherwise, if any (not quarantined) agent reaches the covid center, it gets a visit
        if (this.targetX != undefined) {
            var deltaX = (this.targetX - this.x)
            var deltaY = (this.targetY - this.y)
            var length = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
            // if target is reached both targets are set to undefined, otherwise the agent moves
            if (Math.abs(deltaX) < Dim.epsilon && Math.abs(deltaY) < Dim.epsilon) {
                this.targetX = undefined
                this.targetY = undefined
            } else {
                this.x = this.x + deltaX * Time.agentVelocity / length      
                this.y = this.y + deltaY * Time.agentVelocity / length
            }
        } else if (this.state != State.QUARANTINED && this.covidCentre.checkIn(this.x, this.y)) {
            this.covidCentre.diagnostician.visit(this, date)
        }
        
        // Finally, if the agent is still not quarantined, it can choose a new target with given probability
        if (this.state != State.QUARANTINED && Math.random() < Probabilities.reachNewTarget) {
            let place = places[Math.floor(places.length * Math.random())]
            this.move(place.getRandomX(), place.getRandomY())
        }
    }

    checkInfection(agents, date) {
        if (this.state == State.NORMAL) {
            // stores the array of infected agents that are in the infection range
            let nearbyInfected = agents.filter(a => {
                var dx = a.x - this.x
                var dy = a.y - this.y
                var dm = Dim.infectionRadius + Dim.agentRadius // maximal distance
                return a.state == State.INFECTED && dx * dx + dy * dy <= dm * dm
            })
            // for each one of them, there is a certain probability of getting infected
            for (let i = 0; i < nearbyInfected.length; i++) {
                if (Math.random() < Probabilities.passInfection) {
                    this.state = State.INFECTED
                    this.medicalStatus.infectionDate = new Date(date)
                    return
                }
            }
        }
    }

    draw(context) {
        // Body
        context.beginPath()
        context.arc(this.x, this.y, Dim.agentRadius, 0, 2 * Math.PI, false)

        // Colors depend on the state
        context.fillStyle = this.state.color

        if (this.selected == true) {
            context.lineWidth = Dim.selectedStrokeWidth
            context.strokeStyle = Colors.selectedStroke
            context.stroke()
        }

        context.fill()

        // Infection area
        if (this.state == State.INFECTED) {
            context.beginPath()
            context.arc(this.x, this.y, Dim.infectionRadius, 0, 2 * Math.PI, false)
            context.fillStyle = Colors.infectionArea
            context.fill()
        }

        // Name
        context.fillStyle = Colors.text
        context.fillText(this.name, this.x, this.y - Dim.agentRadius)
    }
}

class MedicalStatus {
    constructor(infectionDate = undefined, notificationDate = undefined, quarantinedDate = undefined) {
        this.infectionDate = infectionDate
        this.notificationDate = notificationDate
        this.quarantinedDate = quarantinedDate
    }
}

const State = {
    NORMAL: { status: "normal", color: Colors.normal },
    INFECTED: { status: "infected", color: Colors.infected },
    NOTIFIED: { status: "notified", color: Colors.notified },
    QUARANTINED: { status: "quarantined", color: Colors.quarantined }
}

export { Agent, MedicalStatus, State }
