import kotlinx.browser.document
import kotlinx.browser.window
import org.w3c.dom.HTMLElement

private fun HTMLElement.showScreen(screen: String) {
    val screens = mapOf(
        "home" to """
            <div class="balance-card"><div class="muted">Available Balance</div><div class="balance">₹1,25,480.00</div><div class="account">•••• 4821</div></div>
            <div class="section-title">Quick Actions</div>
            <div class="actions"><button data-screen="transfer">↗<span>Transfer</span></button><button data-screen="history">↔<span>Transactions</span></button><button data-screen="profile">◉<span>Profile</span></button></div>
            <div class="section-title">Recent Activity</div>
            <div class="transaction"><span>Groceries</span><strong>- ₹1,240</strong></div>
            <div class="transaction"><span>Salary Credit</span><strong class="credit">+ ₹45,000</strong></div>
            <div class="transaction"><span>Electricity Bill</span><strong>- ₹2,100</strong></div>
        """,
        "transfer" to """
            <div class="back" data-screen="home">‹ Back</div><div class="section-title">Send Money</div>
            <label>Recipient Account</label><input id="recipient" placeholder="Enter account number" />
            <label>Amount</label><input id="amount" type="number" placeholder="₹ 0.00" />
            <button class="primary" id="sendBtn">Send Money</button><div id="message" class="message"></div>
        """,
        "history" to """
            <div class="back" data-screen="home">‹ Back</div><div class="section-title">Transactions</div>
            <div class="transaction"><span>Groceries<br><small>Today</small></span><strong>- ₹1,240</strong></div>
            <div class="transaction"><span>Salary Credit<br><small>Yesterday</small></span><strong class="credit">+ ₹45,000</strong></div>
            <div class="transaction"><span>Electricity Bill<br><small>12 Sep</small></span><strong>- ₹2,100</strong></div>
        """,
        "profile" to """
            <div class="back" data-screen="home">‹ Back</div><div class="profile"><div class="avatar">SS</div><h2>Siva Sai</h2><p class="muted">Premium Banking</p></div>
            <div class="profile-row">Account Security <span>›</span></div><div class="profile-row">Notifications <span>›</span></div><div class="profile-row">Settings <span>›</span></div>
        """
    )
    innerHTML = screens[screen] ?: screens.getValue("home")

    querySelectorAll("[data-screen]").asDynamic().forEach { node ->
        (node as? HTMLElement)?.addEventListener("click", { event ->
            event.preventDefault()
            showScreen((node as HTMLElement).getAttribute("data-screen") ?: "home")
        })
    }

    querySelector("#sendBtn")?.addEventListener("click", {
        val amount = (querySelector("#amount") as? org.w3c.dom.HTMLInputElement)?.value ?: ""
        val message = querySelector("#message") as? HTMLElement
        message?.textContent = if (amount.isNotBlank()) "Transfer request created for ₹$amount" else "Enter an amount to continue"
    })
}

fun main() {
    val app = document.getElementById("app") as HTMLElement
    app.showScreen("home")
    window.document.title = "Sai Bank App"
}
