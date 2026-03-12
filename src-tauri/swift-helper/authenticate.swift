import LocalAuthentication
import Foundation

let context = LAContext()
var error: NSError?
let reason = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "Authenticate"

let semaphore = DispatchSemaphore(value: 0)
var success = false
var authError: String?

if context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) {
    context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { result, evalError in
        success = result
        if let evalError = evalError {
            authError = evalError.localizedDescription
        }
        semaphore.signal()
    }
    semaphore.wait()
} else {
    authError = error?.localizedDescription ?? "Biometric authentication not available"
}

if success {
    print("success")
    exit(0)
} else {
    fputs(authError ?? "Authentication failed", stderr)
    exit(1)
}
