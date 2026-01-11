bluetooth.startUartService()

input.calibrateCompass()

basic.forever(function () {
    let h = input.compassHeading()
    let s = input.magneticForce(Dimension.Strength)
    bluetooth.uartWriteLine("H:" + h + ",S:" + s)
    basic.pause(200)
})
