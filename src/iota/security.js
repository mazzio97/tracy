import { Security } from '../simulation/constants.js'
var crypto = require('asymmetric-crypto')


class SecurityToolBox {
    constructor(secretKey="") {
        // this.password = this.generatePassword()
        if (secretKey === "") {
            this.keys = crypto.keyPair()
        } else {
            this.keys = crypto.fromSecretKey(secretKey)
        }
    }

    generatePassword() {
        /**
         * @returns a password using settings specified in Security
         */
        var pass = ""
        for (var i = 0, n = Security.passwordCharset.length; i < Security.passwordLength; ++i) {
            pass += Security.passwordCharset.charAt(Math.floor(Math.random() * n))
        }
        return pass
    }

    encryptMessage(message, receiverPublicKey) {
        /**
         * @param message plaintext to encrypt
         * @param receiverPublicKey receiver's public key used to encrypt,
         * only the receiver will be able to read the message decrypting with
         * its own secret private key
         * 
         * @returns the ciphertext
         */
        return crypto.encrypt(message, receiverPublicKey, this.keys.secretKey)
    }

    decryptMessage(ciphertext, senderPublicKey) {
        /**
         * @param message encrypted data and nonce
         * @param senderPublicKey sender's public key used to verify the 
         * sender's identity
         * 
         * @returns the decrypted message
         */
        return crypto.decrypt(ciphertext.data, ciphertext.nonce, senderPublicKey, this.keys.secretKey)
    }

    signMessage(ciphertext) {
        /**
         * @param ciphertext an encrypted message containing data and nonce
         * 
         * @returns the signature for this message to verify in the future the identity of
         * the sender 
         */
        return crypto.sign(ciphertext.data, this.keys.secretKey)
    }

    static verifyMessage(ciphertext, signature, senderPublicKey) {
        /**
         * @param ciphertext an encrypted message containing data and nonce
         * @param signature the signature generated by the the entity who wants to 
         * prove that it is also the author of the message 
         * @param senderPublicKey sender's public key
         * 
         * @returns true if the signature matches
         */
        return crypto.verify(ciphertext.data, signature, senderPublicKey)
    }
}

export { SecurityToolBox }