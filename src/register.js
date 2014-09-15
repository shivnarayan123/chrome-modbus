(function () {

    Register = function (client, start) {
    
        if (!(this instanceof Register)) {
            return new Register(client, start);
        }

        Events.call(this);

        this.client = client;
        this.start  = start;

        this.status = {
            stateflag_1     : false,
            stateflag_2     : false,
            stateflag_3     : false,
            stateflag_4     : false,
            state           : 0,
            cmd_count       : 0,
            cmd_ex          : false,
            cmd_err         : false,
            arg             : 0
        };

        this._inExecution = false;
        this._queue = [];
        
        this._cmd_id     = 0; 

        this._execute = function (command, param) {

            console.log('Register', 'Queing an new command.', command, param);

            var defer = $.Deferred();

            this._queue.push({
                'deferred'  : defer,
                'command'   : command,
                'param'     : param
            });

            this._flush();

            return defer.promise();

        };
            

        this._flush = function () {
        
            console.log('Register', 'Flushing latest command.');

            if (this._queue.length === 0) {
                console.log('Register', 'Nothing to flush.');
                return;
            }

            if (this._inExecution) {
                console.log('Register', 'Waiting, currently in execution state.');
                return;
            }

            this._inExecution = true;

            var first = this._queue.pop(),
                command = first.command,
                param = first.param,
                defer = first.deferred;
        
            this._cmd_id = (this._cmd_id + 1) % 8;

            var cmd         = command << 3,
                ex_flag     = 1 << 15,
                that        = this;

            this.cmd_reg = this._cmd_id + cmd + ex_flag;


            console.log('Register', 'Writing to modbus server.');

            this.client.writeSingleRegister(this.start + 2, this.cmd_reg)
                .fail(function (err) {
       
                    console.error('Register', 'Sending command to PLC failed.', err);

                    defer.reject({ errCode: 'modbusError' });

                    that._inExecution = false;
                    that._flush();
        
                }).then(function () {
                
                    console.log('Register', 'Sending command to PLC was successfull.');

                    var handler_id, timeout_id;

                    timeout_id = setTimeout(function () {

                        console.error('Register', 'PLC did not executed the command inside the timeframe.');

                        defer.reject({ errCode: 'timeout' });

                        that._inExecution = false;
                        that._flush();

                    }, 5000);

                    handler_id = that.on('update_status', function () {

                        if (that.status.cmd_count === that._cmd_id && 
                            that.status.cmd_ex) { 

                            if (!that.status.cmd_err) {

                                console.log('Register', 'PLC executed command successfully.');

                                defer.resolve(that.status.arg);

                            } else {
         
                                console.error('Register', 'PLC responded with execution error.');              

                                defer.reject({ errCode: 'plcError' });

                            }

                            that.off(handler_id);
                            clearTimeout(timeout_id);

                            that._inExecution = false;
                            that._flush();

                        }

                    });

                });
 
        };

    };

    Register.inherits(Events);

    Register.method('update_status', function (status_reg, status_arg) {
    
        var s_1     = 0x0001,
            s_2     = 0x0002,
            s_3     = 0x0004,
            s_4     = 0x0008,
            s_state = 0x07F0,
            s_cid   = 0x3800,
            s_cide  = 0x4000,
            s_cidf  = 0x8000;


        this.status.stateflag_1 = (status_reg & s_1) >> 0;
        this.status.stateflag_2 = (status_reg & s_2) >> 1;
        this.status.stateflag_3 = (status_reg & s_3) >> 2;
        this.status.stateflag_4 = (status_reg & s_4) >> 3;
        this.status.state       = (status_reg & s_state) >> 4;
        this.status.cmd_count   = (status_reg & s_cid) >> 11;
        this.status.cmd_ex      = (status_reg & s_cide) >> 14;
        this.status.cmd_err     = (status_reg & s_cidf) >> 15;
        this.status.arg         = status_arg;

        this.fire('update_status');

    });


})();