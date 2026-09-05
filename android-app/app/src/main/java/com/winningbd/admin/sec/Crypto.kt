package com.winningbd.admin.sec

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.MessageDigest
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Keystore-backed AES-GCM encryption for the offline sync queue.
 * The key never leaves the AndroidKeyStore.
 */
object Crypto {

    private const val KEYSTORE = "AndroidKeyStore"
    private const val ALIAS = "winningbd_admin_aes"
    private const val GCM_IV_LEN = 12
    private const val GCM_TAG_BITS = 128

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    fun encrypt(plain: ByteArray): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val ct = cipher.doFinal(plain)
        val iv = cipher.iv
        val box = ByteArray(iv.size + ct.size)
        System.arraycopy(iv, 0, box, 0, iv.size)
        System.arraycopy(ct, 0, box, iv.size, ct.size)
        return Base64.encodeToString(box, Base64.NO_WRAP)
    }

    fun decrypt(encoded: String): ByteArray? {
        return try {
            val box = Base64.decode(encoded, Base64.NO_WRAP)
            if (box.size < GCM_IV_LEN + 16) return null
            val iv = box.copyOfRange(0, GCM_IV_LEN)
            val ct = box.copyOfRange(GCM_IV_LEN, box.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(GCM_TAG_BITS, iv))
            cipher.doFinal(ct)
        } catch (e: Exception) {
            null
        }
    }

    fun sha256(text: String): String {
        val md = MessageDigest.getInstance("SHA-256")
        return md.digest(text.toByteArray(Charsets.UTF_8)).joinToString("") { b ->
            String.format(Locale.US, "%02x", b.toInt() and 0xff)
        }
    }
}